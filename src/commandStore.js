const influx = require('./influx');

// Último setpoint/delta mandado pelo site, por device. Guardado só em memória —
// o InfluxDB é a fonte durável (hydrate() lê de lá no arranque), por isso não
// precisa de ficheiro em disco, que se perderia num redeploy sem volume.
const cache = new Map(); // deviceId -> { temperature_set: {value,user,at}, temperature_delta: {...} }

function record(deviceId, type, value, user) {
  const entry = cache.get(deviceId) || {};
  entry[type] = { value: Number(value), user, at: Date.now() };
  cache.set(deviceId, entry);
}

function getLast(deviceId, type) {
  const entry = cache.get(deviceId);
  return entry ? entry[type] : undefined;
}

/** Vai buscar ao InfluxDB o último setpoint/delta de cada device, para o cache sobreviver a um restart do backend */
async function hydrate(deviceIds) {
  for (const id of deviceIds) {
    for (const type of ['temperature_set', 'temperature_delta']) {
      const last = await influx.queryLastCommand(id, type);
      if (last) record(id, type, last.value, last.user);
    }
  }
}

module.exports = { record, getLast, hydrate };
