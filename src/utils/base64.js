'use strict';

const AppError = require('./appError');

/**
 * Remove prefixo data URI se presente e normaliza o base64.
 * Aceita: base64 puro ou data:*;base64,<dados>
 * @param {string} input
 * @returns {string} base64 limpo
 */
function normalize(input) {
  if (typeof input !== 'string') {
    throw new AppError('Campo audio inválido', 400, 'AUDIO_INVALID_TYPE');
  }

  let raw = input.trim();

  // Remove data URI prefix: data:<mimetype>;base64,
  const dataUriMatch = raw.match(/^data:[^;]+;base64,(.+)$/s);
  if (dataUriMatch) {
    raw = dataUriMatch[1];
  }

  // Remove espaços e quebras de linha
  raw = raw.replace(/[\s\r\n]/g, '');

  if (!raw) {
    throw new AppError('Base64 inválido', 400, 'BASE64_EMPTY');
  }

  return raw;
}

/**
 * Valida e converte base64 para Buffer.
 * @param {string} base64
 * @returns {Buffer}
 */
function toBuffer(base64) {
  const normalized = normalize(base64);

  // Valida caracteres base64 válidos (inclui padding)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new AppError('Base64 inválido', 400, 'BASE64_INVALID_CHARS');
  }

  let buf;
  try {
    buf = Buffer.from(normalized, 'base64');
  } catch {
    throw new AppError('Base64 inválido', 400, 'BASE64_DECODE_FAILED');
  }

  if (!buf || buf.length === 0) {
    throw new AppError('Base64 inválido', 400, 'BASE64_EMPTY_BUFFER');
  }

  return buf;
}

/**
 * Converte Buffer para base64 string.
 * @param {Buffer} buffer
 * @returns {string}
 */
function fromBuffer(buffer) {
  return buffer.toString('base64');
}

module.exports = { normalize, toBuffer, fromBuffer };
