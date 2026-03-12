'use strict';

const env = require('../config/env');
const AppError = require('../utils/appError');
const base64Utils = require('../utils/base64');
const mimeUtils = require('../utils/mime');
const logger = require('../utils/logger');
const { buildTempPath, writeTempFile, readTempFile, removeTempFiles } = require('../infra/tempFileManager');
const { runFfmpeg } = require('../infra/ffmpegRunner');

/**
 * Valida o payload de entrada do endpoint /convert.
 * Lança AppError para qualquer campo inválido.
 *
 * @param {object} body
 * @returns {{ audioBuffer: Buffer, mimetype: string }}
 */
function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError('JSON inválido', 400, 'BODY_INVALID');
  }

  // Validar mimetype
  if (!('mimetype' in body)) {
    throw new AppError('Campo mimetype é obrigatório', 400, 'MIMETYPE_MISSING');
  }
  if (typeof body.mimetype !== 'string' || !body.mimetype.trim()) {
    throw new AppError('Campo mimetype é obrigatório', 400, 'MIMETYPE_INVALID');
  }

  // Validar audio
  if (!('audio' in body)) {
    throw new AppError('Campo audio inválido', 400, 'AUDIO_MISSING');
  }
  if (typeof body.audio !== 'string') {
    throw new AppError('Campo audio inválido', 400, 'AUDIO_INVALID_TYPE');
  }

  // Converter e validar base64
  const audioBuffer = base64Utils.toBuffer(body.audio);

  // Verificar tamanho
  if (audioBuffer.length > env.MAX_AUDIO_BYTES) {
    throw new AppError('Arquivo excede o limite permitido', 413, 'AUDIO_TOO_LARGE');
  }

  return { audioBuffer, mimetype: body.mimetype.trim() };
}

/**
 * Orquestra o fluxo completo de conversão de áudio.
 *
 * @param {object} body  - Body da requisição
 * @param {string} requestId
 * @returns {Promise<string>} base64 do áudio OGG Opus convertido
 */
async function convert(body, requestId) {
  const { audioBuffer, mimetype } = validatePayload(body);

  const inputExt = mimeUtils.resolveExtension(mimetype);
  const inputPath = buildTempPath(inputExt, requestId);
  const outputPath = buildTempPath('ogg', requestId);

  logger.info('Iniciando conversão', {
    requestId,
    mimetype,
    inputExt,
    inputSizeBytes: audioBuffer.length,
  });

  try {
    await writeTempFile(audioBuffer, inputPath);
    await runFfmpeg(inputPath, outputPath, requestId);

    const outputBuffer = await readTempFile(outputPath);

    if (!outputBuffer || outputBuffer.length === 0) {
      throw new AppError('Falha ao converter áudio', 422, 'OUTPUT_EMPTY');
    }

    const resultBase64 = base64Utils.fromBuffer(outputBuffer);

    logger.info('Conversão concluída', {
      requestId,
      outputSizeBytes: outputBuffer.length,
    });

    return resultBase64;
  } finally {
    await removeTempFiles([inputPath, outputPath], requestId);
  }
}

module.exports = { convert };
