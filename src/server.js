const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { config } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');
const influx = require('./influx');
const commandStore = require('./commandStore');
const { publishCommand } = require('./mqttClient');

/** Devolve o nome da pessoa dona da chave, ou null se a chave não for válida */
function identifyKey(key) {
  if (!key) return null;
  if (key === config.http.apiKey) return 'admin';
  return config.http.namedApiKeys[key] || null;
}

function requireApiKey(req, res, next) {
  const user = identifyKey(req.get('x-api-key'));
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

function createServer(mqttClient) {
  const app = express();
  app.use(express.json());

  // O dashboard corre noutra origem (ficheiro local ou outro domínio), por isso
  // precisa destes cabeçalhos para o browser deixar de bloquear os pedidos.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,x-api-key');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Serve o próprio dashboard, para poderes abri-lo direto pelo URL do backend
  // (ex: http://localhost:3000) sem teres de duplicar o URL em lado nenhum.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ ok: true, mqtt: mqttClient.connected, influx: influx.enabled });
  });

  app.get('/api/devices', requireApiKey, (req, res) => {
    res.json(deviceStore.snapshot());
  });

  app.get('/api/devices/:id/history', requireApiKey, async (req, res) => {
    const hours = Number(req.query.hours) || 24;
    const rows = await influx.queryHistory(req.params.id, hours);
    res.json(rows);
  });

  app.get('/api/devices/:id/valve-history', requireApiKey, async (req, res) => {
    const hours = Number(req.query.hours) || 24;
    const rows = await influx.queryValveHistory(req.params.id, hours);
    res.json(rows);
  });

  app.get('/api/devices/:id/commands', requireApiKey, async (req, res) => {
    const hours = Number(req.query.hours) || 24;
    const rows = await influx.queryCommands(req.params.id, hours);
    res.json(rows);
  });

  app.get('/api/devices/:id/events', requireApiKey, async (req, res) => {
    const hours = Number(req.query.hours) || 24;
    const rows = await influx.queryDeviceEvents(req.params.id, hours);
    res.json(rows);
  });

  app.post('/api/devices/:id/command', requireApiKey, (req, res) => {
    const { type, value } = req.body || {};
    const allowed = ['temperature_set', 'temperature_delta', 'valve_toggle'];
    if (!allowed.includes(type)) {
      return res.status(400).json({ error: 'tipo de comando inválido', allowed });
    }
    logger.info({ user: req.user, deviceId: req.params.id, type, value }, 'Comando enviado');
    publishCommand(mqttClient, req.params.id, type, value, (err) => {
      if (err) {
        logger.error({ err, deviceId: req.params.id, type, user: req.user }, 'Falha ao publicar comando');
        return res.status(502).json({ error: 'falha ao publicar no broker' });
      }
      if (type === 'temperature_set' || type === 'temperature_delta') {
        commandStore.record(req.params.id, type, value, req.user);
      }
      influx.writeCommand(req.params.id, req.user, type, value);
      res.json({ ok: true });
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(msg) {
    const payload = JSON.stringify(msg);
    wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    });
  }

  wss.on('connection', (ws, req) => {
    const key = new URL(req.url, 'http://x').searchParams.get('key');
    const user = identifyKey(key);
    if (!user) {
      ws.close(4001, 'unauthorized');
      return;
    }
    ws.user = user;
    logger.info({ user }, 'Dashboard ligado');
    ws.on('close', () => logger.info({ user }, 'Dashboard desligado'));
    ws.send(JSON.stringify({ type: 'snapshot', devices: deviceStore.snapshot() }));
  });

  deviceStore.on('update', (id, dev) => {
    broadcast({ type: 'update', device: dev });
  });

  server.listen(config.http.port, () => {
    logger.info({ port: config.http.port }, 'API + WebSocket a correr');
  });

  return server;
}

module.exports = { createServer };
