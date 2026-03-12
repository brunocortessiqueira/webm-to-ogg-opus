'use strict';

/**
 * Resposta de sucesso padrão
 * @param {import('express').Response} res
 * @param {string} audioBase64
 * @param {number} [statusCode=200]
 */
function success(res, audioBase64, statusCode = 200) {
  return res.status(statusCode).json({
    status: true,
    erro: '',
    audio: audioBase64,
    mimetype: 'audio/ogg',
  });
}

/**
 * Resposta de erro padrão
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 */
function error(res, message, statusCode = 500) {
  return res.status(statusCode).json({
    status: false,
    erro: message,
    audio: '',
    mimetype: '',
  });
}

/**
 * Resposta de health check
 * @param {import('express').Response} res
 */
function health(res) {
  return res.status(200).json({
    status: true,
    erro: '',
    audio: '',
    mimetype: '',
    service: 'up',
  });
}

module.exports = { success, error, health };
