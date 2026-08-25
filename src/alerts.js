const nodemailer = require('nodemailer');
const { config } = require('./config');
const logger = require('./logger');
const deviceStore = require('./deviceStore');

let transporter = null;
if (config.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

async function sendAlert(subject, text) {
  if (!transporter) {
    logger.warn({ subject }, 'Alerta suprimido — SMTP não configurado');
    return;
  }
  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: config.smtp.to,
      subject,
      text,
    });
    logger.info({ subject }, 'Alerta enviado por email');
  } catch (err) {
    logger.error({ err }, 'Falha ao enviar email de alerta');
  }
}

function wireAlerts() {
  deviceStore.on('status-change', (id, online) => {
    if (!online) {
      sendAlert(
        'QSAAFrigus: dispositivo offline',
        `${id} deixou de publicar dados. Verifica a ligação do dispositivo.`
      );
    }
  });

  deviceStore.on('threshold-cross', (id, temp) => {
    sendAlert(
      'QSAAFrigus: temperatura acima do limite',
      `${id} está a ${temp.toFixed(1)}°C, acima do limiar de ${config.tempAlertThreshold}°C.`
    );
  });
}

module.exports = { wireAlerts };
