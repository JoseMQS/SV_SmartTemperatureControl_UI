const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { config } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');
const influx = require('./influx');

function requireApiKey(req, res, next) {
  if (req.get('x-api-key') !== config.http.apiKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function createServer(mqttClient) {
  const app = express();
  app.use(express.json());

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

  app.post('/api/devices/:id/command', requireApiKey, (req, res) => {
    const { type, value } = req.body || {};
    const allowed = ['temperature_set', 'temperature_delta', 'valve_toggle'];
    if (!allowed.includes(type)) {
      return res.status(400).json({ error: 'tipo de comando inválido', allowed });
    }
    const topic = `${config.topicBase}/${req.params.id}/${type}`;
    mqttClient.publish(topic, String(value), { qos: 1 }, (err) => {
      if (err) {
        logger.error({ err, topic }, 'Falha ao publicar comando');
        return res.status(502).json({ error: 'falha ao publicar no broker' });
      }
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
    if (key !== config.http.apiKey) {
      ws.close(4001, 'unauthorized');
      return;
    }
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
