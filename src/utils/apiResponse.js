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
 * Resposta de erro padrão.
 *
 * `code` e `detalhes` são opcionais e só aparecem quando existem, para não
 * mudar o formato que os clientes de áudio já consomem. Servem ao caso em que o
 * cliente precisa reagir ao erro e não só exibi-lo — um vídeo longo demais, por
 * exemplo, devolve a duração máxima suportada para que o operador saiba quanto
 * cortar.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 * @param {object} [extras]
 * @param {string} [extras.code]
 * @param {object} [extras.detalhes]
 */
function error(res, message, statusCode = 500, extras = {}) {
  const corpo = {
    status: false,
    erro: message,
    audio: '',
    mimetype: '',
  };
  if (extras.code) corpo.code = extras.code;
  if (extras.detalhes) corpo.detalhes = extras.detalhes;

  return res.status(statusCode).json(corpo);
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
