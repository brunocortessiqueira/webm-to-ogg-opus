'use strict';

const { spawn } = require('child_process');
const env = require('../config/env');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

/**
 * Executa ffmpeg para converter inputPath em OGG Opus, salvando em outputPath.
 * Usa spawn com array de argumentos (sem interpolação de shell).
 *
 * @param {string} inputPath  - Caminho absoluto do arquivo de entrada
 * @param {string} outputPath - Caminho absoluto do arquivo de saída (.ogg)
 * @param {string} requestId
 * @returns {Promise<void>}
 */
function runFfmpeg(inputPath, outputPath, requestId) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      outputPath,
    ];

    logger.debug('Iniciando ffmpeg', { requestId, args: args.join(' ') });

    let proc;
    try {
      proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (spawnErr) {
      if (spawnErr.code === 'ENOENT') {
        return reject(new AppError('ffmpeg não encontrado no sistema', 500, 'FFMPEG_NOT_FOUND'));
      }
      return reject(new AppError('Erro interno ao converter áudio', 500, 'FFMPEG_SPAWN_ERROR'));
    }

    let stderrOutput = '';
    proc.stderr.on('data', (chunk) => {
      stderrOutput += chunk.toString();
    });

    const timeoutHandle = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new AppError('Timeout na conversão do áudio', 504, 'FFMPEG_TIMEOUT'));
    }, env.FFMPEG_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      if (err.code === 'ENOENT') {
        return reject(new AppError('ffmpeg não encontrado no sistema', 500, 'FFMPEG_NOT_FOUND'));
      }
      logger.error('Erro no processo ffmpeg', { requestId, error: err.message });
      reject(new AppError('Erro interno ao converter áudio', 500, 'FFMPEG_PROCESS_ERROR'));
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);

      if (code !== 0) {
        logger.warn('ffmpeg encerrou com código não-zero', {
          requestId,
          code,
          stderr: stderrOutput.slice(-500),
        });

        // Detecta formato não suportado ou arquivo inválido
        if (
          stderrOutput.includes('Invalid data found') ||
          stderrOutput.includes('could not find codec') ||
          stderrOutput.includes('no such file or directory') ||
          stderrOutput.includes('Unknown encoder') ||
          stderrOutput.includes('matches no streams')
        ) {
          return reject(new AppError('Falha ao converter áudio', 422, 'FFMPEG_INVALID_INPUT'));
        }

        return reject(new AppError('Falha ao converter áudio', 422, 'FFMPEG_NONZERO_EXIT'));
      }

      logger.debug('ffmpeg concluído com sucesso', { requestId });
      resolve();
    });
  });
}

module.exports = { runFfmpeg };
