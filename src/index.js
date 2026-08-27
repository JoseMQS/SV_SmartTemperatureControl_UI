const { config, assertConfig } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');
const { createMqttClient, publishCommand } = require('./mqttClient');
const { wireAlerts } = require('./alerts');
const { createServer } = require('./server');
const influx = require('./influx');
const commandStore = require('./commandStore');

assertConfig(logger);

// margem de tolerância ao comparar o que o device reporta com o último valor
// mandado pelo site, para não disparar por causa de arredondamentos do sensor
const SETPOINT_EPS = 0.05;

async function main() {
  logger.info({ devices: config.deviceIds }, 'A arrancar QSAAFrigus backend');

  // lê do InfluxDB o último setpoint/delta mandado a cada device, para o cache
  // sobreviver a um restart do backend (não só a um reboot do ESP32)
  await commandStore.hydrate(config.deviceIds);

  const mqttClient = createMqttClient();
  wireAlerts();
  createServer(mqttClient);

  deviceStore.on('valve-change', (id, open) => influx.writeValveState(id, open));

  // Quando um device volta a ficar online, compara o que ele reporta com o
  // último valor que o site mandou. Se não bater certo, o ESP32 reiniciou e
  // voltou aos defaults do firmware — reenvia o comando para repor o valor do
  // site. Se bater certo, foi só uma quebra de ligação e não faz nada.
  deviceStore.on('status-change', (id, online) => {
    if (!online) return;
    const dev = deviceStore.get(id);
    const lastSet = commandStore.getLast(id, 'temperature_set');
    const lastDelta = commandStore.getLast(id, 'temperature_delta');
    const setMismatch = lastSet && (dev.temperature_set === null || Math.abs(dev.temperature_set - lastSet.value) > SETPOINT_EPS);
    const deltaMismatch = lastDelta && (dev.temperature_delta === null || Math.abs(dev.temperature_delta - lastDelta.value) > SETPOINT_EPS);
    const correctionApplied = !!(setMismatch || deltaMismatch);

    if (setMismatch) publishCommand(mqttClient, id, 'temperature_set', lastSet.value);
    if (deltaMismatch) publishCommand(mqttClient, id, 'temperature_delta', lastDelta.value);

    influx.writeDeviceEvent(id, {
      kind: correctionApplied ? 'reboot_suspected' : 'reconnect',
      correctionApplied,
      reportedSet: dev.temperature_set,
      reportedDelta: dev.temperature_delta,
      expectedSet: lastSet && lastSet.value,
      expectedDelta: lastDelta && lastDelta.value,
    });

    if (correctionApplied) {
      logger.warn(
        {
          deviceId: id,
          reportedSet: dev.temperature_set,
          reportedDelta: dev.temperature_delta,
          expectedSet: lastSet && lastSet.value,
          expectedDelta: lastDelta && lastDelta.value,
        },
        'Device reiniciou (valores diferentes do último comando do site) — a repor'
      );
    }
  });

  // verifica devices offline a cada 5s
  setInterval(() => deviceStore.checkOffline(), 5000);

  process.on('SIGTERM', () => {
    logger.info('A desligar…');
    mqttClient.end(false, {}, () => process.exit(0));
  });
}

main().catch((err) => {
  logger.error({ err }, 'Falha ao arrancar');
  process.exit(1);
});
