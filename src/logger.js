const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino(
  isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
);

module.exports = logger;
