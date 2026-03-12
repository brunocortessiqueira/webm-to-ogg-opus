'use strict';

// Carregar variáveis de ambiente antes de qualquer import de config
require('dotenv').config();

const env = require('./config/env');
const logger = require('./utils/logger');
const app = require('./app');

// Captura de exceções não tratadas para evitar crash silencioso
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException — encerrando processo', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection — encerrando processo', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

const server = app.listen(env.PORT, () => {
  logger.info('Servidor iniciado', {
    port: env.PORT,
    env: env.NODE_ENV,
  });
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`Sinal ${signal} recebido. Encerrando servidor...`);
  server.close(() => {
    logger.info('Servidor encerrado.');
    process.exit(0);
  });

  // Força encerramento após 10s se conexões não fecharem
  setTimeout(() => {
    logger.warn('Forçando encerramento após timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
