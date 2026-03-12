'use strict';

require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_KEY: process.env.API_KEY || '',
  MAX_AUDIO_BYTES: parseInt(process.env.MAX_AUDIO_BYTES || String(25 * 1024 * 1024), 10),
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || '35mb',
  FFMPEG_TIMEOUT_MS: parseInt(process.env.FFMPEG_TIMEOUT_MS || '30000', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

if (!env.API_KEY) {
  console.error('[config] FATAL: API_KEY não definida. A aplicação não pode iniciar sem uma chave de API.');
  process.exit(1);
}

module.exports = env;
