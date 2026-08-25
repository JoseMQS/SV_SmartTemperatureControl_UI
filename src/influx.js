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

function writeTemperature(deviceId, temperature) {
  if (!writeApi || temperature === null || Number.isNaN(temperature)) return;
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

module.exports = { writeTemperature, queryHistory, enabled: !!writeApi };
