const { config, assertConfig } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');
const { createMqttClient } = require('./mqttClient');
const { wireAlerts } = require('./alerts');
const { createServer } = require('./server');

assertConfig(logger);

logger.info({ devices: config.deviceIds }, 'A arrancar QSAAFrigus backend');

const mqttClient = createMqttClient();
wireAlerts();
createServer(mqttClient);

// verifica devices offline a cada 5s
setInterval(() => deviceStore.checkOffline(), 5000);

process.on('SIGTERM', () => {
  logger.info('A desligar…');
  mqttClient.end(false, {}, () => process.exit(0));
});
