'use strict';

const { spawn } = require('child_process');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

/**
 * Lê duração e dimensões de um arquivo de mídia.
 *
 * É o primeiro passo obrigatório da recodificação de vídeo: o bitrate alvo sai
 * da duração (ver videoProfile.js), então sem esta leitura não há como decidir
 * nem a resolução nem quantos bits gastar.
 *
 * Usa `ffprobe`, que acompanha o pacote `ffmpeg` do Alpine. Se em algum
 * ambiente ele não existir, o erro é explícito (`FFPROBE_NOT_FOUND`) em vez de
 * virar um "falha ao converter" genérico três camadas acima.
 */

const TIMEOUT_PADRAO_MS = 30000;

/**
 * @typedef {object} InfoMidia
 * @property {number} duracaoSegundos
 * @property {number|null} largura
 * @property {number|null} altura
 * @property {boolean} temVideo
 * @property {boolean} temAudio
 */

/**
 * @param {string} caminho
 * @param {object} [opcoes]
 * @param {string} [opcoes.requestId]
 * @param {number} [opcoes.timeoutMs]
 * @returns {Promise<InfoMidia>}
 */
function probe(caminho, { requestId, timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,width,height',
      '-of', 'json',
      caminho,
    ];

    let proc;
    try {
      proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return reject(new AppError('ffprobe não encontrado no sistema', 500, 'FFPROBE_NOT_FOUND'));
      }
      return reject(new AppError('Erro interno ao inspecionar mídia', 500, 'FFPROBE_SPAWN_ERROR'));
    }

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new AppError('Timeout ao inspecionar mídia', 504, 'FFPROBE_TIMEOUT'));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        return reject(new AppError('ffprobe não encontrado no sistema', 500, 'FFPROBE_NOT_FOUND'));
      }
      logger.error('Erro no processo ffprobe', { requestId, error: err.message });
      reject(new AppError('Erro interno ao inspecionar mídia', 500, 'FFPROBE_PROCESS_ERROR'));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        logger.warn('ffprobe encerrou com código não-zero', {
          requestId,
          code,
          stderr: stderr.slice(-500),
        });
        return reject(new AppError('Arquivo de mídia inválido', 422, 'FFPROBE_INVALID_INPUT'));
      }

      let dados;
      try {
        dados = JSON.parse(stdout);
      } catch {
        return reject(new AppError('Não foi possível ler os dados da mídia', 422, 'FFPROBE_OUTPUT_INVALID'));
      }

      const streams = Array.isArray(dados.streams) ? dados.streams : [];
      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');
      const duracao = parseFloat(dados.format && dados.format.duration);

      // Sem duração não dá para escolher perfil. Acontece em arquivo truncado e
      // em stream ao vivo — nos dois casos, recodificar às cegas é pior.
      if (!Number.isFinite(duracao) || duracao <= 0) {
        return reject(new AppError('Não foi possível ler a duração do vídeo', 422, 'DURACAO_DESCONHECIDA'));
      }

      resolve({
        duracaoSegundos: duracao,
        largura: video && Number.isFinite(video.width) ? video.width : null,
        altura: video && Number.isFinite(video.height) ? video.height : null,
        temVideo: Boolean(video),
        temAudio: Boolean(audio),
      });
    });
  });
}

module.exports = { probe };
