const fs = require('fs');
const mqtt = require('mqtt');
const { config } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');
const influx = require('./influx');

function createMqttClient() {
  const protocol = config.broker.useTls ? 'mqtts' : 'mqtt';
  const url = `${protocol}://${config.broker.host}:${config.broker.port}`;

  let ca;
  if (config.broker.caPath) {
    ca = fs.readFileSync(config.broker.caPath);
  }

  const client = mqtt.connect(url, {
    username: config.broker.user,
    password: config.broker.pass,
    clientId: 'qsaafrigus-backend-' + Math.random().toString(16).slice(2, 8),
    reconnectPeriod: 3000, // tenta religar a cada 3s indefinidamente
    connectTimeout: 15000,
    protocolVersion: 5,
    ca,
    rejectUnauthorized: true,
  });

  client.on('connect', () => {
    logger.info({ url }, 'Ligado ao broker MQTT');
    const topic = `${config.topicBase}/+/data`;
    client.subscribe(topic, { qos: 2 }, (err) => {
      if (err) logger.error({ err, topic }, 'Falha ao subscrever');
      else logger.info({ topic }, 'Subscrito');
    });
  });

  client.on('reconnect', () => logger.warn('A tentar religar ao broker…'));
  client.on('close', () => logger.warn('Ligação ao broker fechada'));
  client.on('error', (err) => logger.error({ err }, 'Erro no cliente MQTT'));

  client.on('message', (topic, payload) => {
    const parts = topic.split('/');
    const deviceId = parts[1];
    if (!topic.endsWith('/data')) return;

    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch (err) {
      logger.warn({ topic, raw: payload.toString() }, 'Payload não é JSON válido — ignorado');
      return;
    }

    deviceStore.update(deviceId, data);
    if (typeof data.current_temperature !== 'undefined') {
      influx.writeTemperature(deviceId, Number(data.current_temperature));
    }
  });

  return client;
}

module.exports = { createMqttClient };
