require('dotenv').config();

function num(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : Number(v);
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true';
}

function list(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  broker: {
    host: process.env.BROKER_HOST,
    port: num('BROKER_PORT', 8883),
    useTls: bool('BROKER_USE_TLS', true),
    user: process.env.BROKER_USER || undefined,
    pass: process.env.BROKER_PASS || undefined,
  },
  topicBase: process.env.TOPIC_BASE || 'QSAAFrigus',
  deviceIds: list('DEVICE_IDS', ['sensor1', 'sensor2', 'sensor3', 'sensor4']),
  offlineMs: num('OFFLINE_MS', 60000),
  tempAlertThreshold: num('TEMP_ALERT_THRESHOLD', 20),
  smtp: {
    host: process.env.SMTP_HOST,
    port: num('SMTP_PORT', 465),
    secure: bool('SMTP_SECURE', true),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.ALERT_EMAIL_FROM,
    to: process.env.ALERT_EMAIL_TO,
  },
  influx: {
    url: process.env.INFLUX_URL,
    token: process.env.INFLUX_TOKEN,
    org: process.env.INFLUX_ORG,
    bucket: process.env.INFLUX_BUCKET,
  },
  http: {
    port: num('HTTP_PORT', 3000),
    apiKey: process.env.API_KEY,
  },
};

function assertConfig(logger) {
  const missing = [];
  if (!config.broker.host) missing.push('BROKER_HOST');
  if (!config.http.apiKey) missing.push('API_KEY');
  if (missing.length) {
    logger.error({ missing }, 'Configuração em falta — confere o .env');
    process.exit(1);
  }
  if (!config.influx.token) {
    logger.warn('INFLUX_TOKEN não definido — o logging para o InfluxDB fica desativado');
  }
  if (!config.smtp.pass) {
    logger.warn('SMTP_PASS não definido — os alertas por email ficam desativados');
  }
}

module.exports = { config, assertConfig };
