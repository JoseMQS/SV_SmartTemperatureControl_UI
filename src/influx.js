const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { config } = require('./config');
const logger = require('./logger');

let writeApi = null;
let queryApi = null;

if (config.influx.token) {
  const influxDB = new InfluxDB({ url: config.influx.url, token: config.influx.token });
  writeApi = influxDB.getWriteApi(config.influx.org, config.influx.bucket, 'ms');
  queryApi = influxDB.getQueryApi(config.influx.org);
}

// evita gravar uma leitura por cada mensagem MQTT (podem chegar a cada poucos segundos) —
// só escreve, no máximo, uma vez a cada `writeIntervalMs` por device.
const lastWriteMs = new Map();

function writeTemperature(deviceId, temperature) {
  if (!writeApi || temperature === null || Number.isNaN(temperature)) return;
  const now = Date.now();
  const last = lastWriteMs.get(deviceId) || 0;
  if (now - last < config.influx.writeIntervalMs) return;
  lastWriteMs.set(deviceId, now);

  const point = new Point('temp')
    .tag('device_name', deviceId)
    .tag('location', 'adega')
    .floatField('temperature', temperature);
  writeApi.writePoint(point);
  // flush sem bloquear o caller
  writeApi.flush().catch((err) => logger.error({ err }, 'Falha ao escrever no InfluxDB'));
}

/** Devolve [{ time, value }] das últimas `hours` horas para um device */
async function queryHistory(deviceId, hours = 24) {
  if (!queryApi) return [];
  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "temp")
      |> filter(fn: (r) => r.device_name == "${deviceId}")
      |> filter(fn: (r) => r._field == "temperature")
      |> sort(columns: ["_time"])
  `;
  const rows = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const o = tableMeta.toObject(values);
      rows.push({ time: o._time, value: o._value });
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Falha ao consultar histórico no InfluxDB');
  }
  return rows;
}

function writeValveState(deviceId, open) {
  if (!writeApi) return;
  const point = new Point('valve')
    .tag('device_name', deviceId)
    .tag('location', 'adega')
    .booleanField('open', open);
  writeApi.writePoint(point);
  writeApi.flush().catch((err) => logger.error({ err }, 'Falha ao escrever estado da válvula no InfluxDB'));
}

/** Devolve [{ time, open }] das mudanças de estado da válvula nas últimas `hours` horas */
async function queryValveHistory(deviceId, hours = 24) {
  if (!queryApi) return [];
  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "valve")
      |> filter(fn: (r) => r.device_name == "${deviceId}")
      |> filter(fn: (r) => r._field == "open")
      |> sort(columns: ["_time"])
  `;
  const rows = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const o = tableMeta.toObject(values);
      rows.push({ time: o._time, open: o._value });
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Falha ao consultar histórico da válvula no InfluxDB');
  }
  return rows;
}

function writeCommand(deviceId, user, type, value) {
  if (!writeApi) return;
  const point = new Point('commands')
    .tag('device_name', deviceId)
    .tag('type', type)
    .tag('user', user)
    .stringField('value', String(value));
  writeApi.writePoint(point);
  writeApi.flush().catch((err) => logger.error({ err }, 'Falha ao escrever comando no InfluxDB'));
}

/** Devolve [{ time, type, user, value }] dos comandos enviados nas últimas `hours` horas */
async function queryCommands(deviceId, hours = 24) {
  if (!queryApi) return [];
  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "commands")
      |> filter(fn: (r) => r.device_name == "${deviceId}")
      |> filter(fn: (r) => r._field == "value")
      |> sort(columns: ["_time"])
  `;
  const rows = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const o = tableMeta.toObject(values);
      rows.push({ time: o._time, type: o.type, user: o.user, value: o._value });
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Falha ao consultar histórico de comandos no InfluxDB');
  }
  return rows;
}

/** Último comando de um `type` para um device, ou null. Usado só para hidratar o cache no arranque. */
async function queryLastCommand(deviceId, type) {
  if (!queryApi) return null;
  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: -365d)
      |> filter(fn: (r) => r._measurement == "commands")
      |> filter(fn: (r) => r.device_name == "${deviceId}")
      |> filter(fn: (r) => r.type == "${type}")
      |> filter(fn: (r) => r._field == "value")
      |> last()
  `;
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const o = tableMeta.toObject(values);
      return { value: Number(o._value), user: o.user, at: o._time };
    }
  } catch (err) {
    logger.error({ err, deviceId, type }, 'Falha ao consultar último comando no InfluxDB');
  }
  return null;
}

function writeDeviceEvent(deviceId, { kind, correctionApplied, reportedSet, reportedDelta, expectedSet, expectedDelta }) {
  if (!writeApi) return;
  const point = new Point('device_events')
    .tag('device_name', deviceId)
    .tag('kind', kind)
    .booleanField('correction_applied', !!correctionApplied);
  if (reportedSet !== null && reportedSet !== undefined) point.floatField('reported_set', reportedSet);
  if (reportedDelta !== null && reportedDelta !== undefined) point.floatField('reported_delta', reportedDelta);
  if (expectedSet !== null && expectedSet !== undefined) point.floatField('expected_set', expectedSet);
  if (expectedDelta !== null && expectedDelta !== undefined) point.floatField('expected_delta', expectedDelta);
  writeApi.writePoint(point);
  writeApi.flush().catch((err) => logger.error({ err }, 'Falha ao escrever evento do device no InfluxDB'));
}

/** Devolve [{ time, kind, correctionApplied, reportedSet, reportedDelta, expectedSet, expectedDelta }] */
async function queryDeviceEvents(deviceId, hours = 24) {
  if (!queryApi) return [];
  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: -${hours}h)
      |> filter(fn: (r) => r._measurement == "device_events")
      |> filter(fn: (r) => r.device_name == "${deviceId}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;
  const rows = [];
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const o = tableMeta.toObject(values);
      rows.push({
        time: o._time,
        kind: o.kind,
        correctionApplied: o.correction_applied,
        reportedSet: o.reported_set,
        reportedDelta: o.reported_delta,
        expectedSet: o.expected_set,
        expectedDelta: o.expected_delta,
      });
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Falha ao consultar eventos do device no InfluxDB');
  }
  return rows;
}

module.exports = {
  writeTemperature,
  queryHistory,
  writeValveState,
  queryValveHistory,
  writeCommand,
  queryCommands,
  queryLastCommand,
  writeDeviceEvent,
  queryDeviceEvents,
  enabled: !!writeApi,
};
