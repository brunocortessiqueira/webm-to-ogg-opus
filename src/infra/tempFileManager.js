'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const TEMP_DIR = os.tmpdir();

/**
 * Gera um caminho de arquivo temporário único.
 * @param {string} extension - extensão sem ponto
 * @param {string} requestId
 * @returns {string} caminho absoluto
 */
function buildTempPath(extension, requestId) {
  const filename = `audio-${requestId}-${uuidv4()}.${extension}`;
  return path.join(TEMP_DIR, filename);
}

/**
 * Escreve buffer em arquivo temporário.
 * @param {Buffer} buffer
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function writeTempFile(buffer, filePath) {
  await fs.promises.writeFile(filePath, buffer);
}

/**
 * Lê arquivo temporário como Buffer.
 * @param {string} filePath
 * @returns {Promise<Buffer>}
 */
async function readTempFile(filePath) {
  return fs.promises.readFile(filePath);
}

/**
 * Remove um arquivo temporário sem lançar exceções.
 * @param {string} filePath
 * @param {string} requestId
 */
async function removeTempFile(filePath, requestId) {
  try {
    await fs.promises.unlink(filePath);
    logger.debug('Arquivo temporário removido', { requestId, filePath });
  } catch (err) {
    // Ignora ENOENT (arquivo já não existe), loga outros erros
    if (err.code !== 'ENOENT') {
      logger.warn('Falha ao remover arquivo temporário', { requestId, filePath, error: err.message });
    }
  }
}

/**
 * Remove múltiplos arquivos temporários, todos de forma silenciosa.
 * @param {string[]} filePaths
 * @param {string} requestId
 */
async function removeTempFiles(filePaths, requestId) {
  await Promise.all(filePaths.map((fp) => removeTempFile(fp, requestId)));
}

module.exports = { buildTempPath, writeTempFile, readTempFile, removeTempFiles };
