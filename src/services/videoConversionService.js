'use strict';

const fs = require('fs');
const env = require('../config/env');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { buildTempPath, removeTempFiles } = require('../infra/tempFileManager');
const { baixarParaArquivo } = require('../infra/mediaFetcher');
const { probe } = require('../infra/ffprobeRunner');
const { executarFfmpeg } = require('../infra/ffmpegRunner');
const { escolherPerfil, montarArgsFfmpeg } = require('./videoProfile');

/**
 * Recodifica um vídeo para caber no limite de mídia do destino.
 *
 * O fluxo é: baixar → medir → escolher perfil → recodificar → conferir.
 *
 * A última etapa não é zelo excessivo. `-b:v` é um alvo, não uma garantia: o
 * encoder pode estourar em cena de muito movimento, e entregar um arquivo acima
 * do teto significa o envio falhar lá na frente, com um erro genérico da Meta
 * que não diz o que houve. Conferir aqui custa um `stat` e transforma isso num
 * erro que explica o problema.
 */

/**
 * @param {object} corpo
 * @returns {{ sourceUrl: string, maxBytes: number }}
 */
function validarPayload(corpo) {
  if (!corpo || typeof corpo !== 'object') {
    throw new AppError('JSON inválido', 400, 'BODY_INVALID');
  }

  const sourceUrl = corpo.source_url;
  if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) {
    throw new AppError('Campo source_url é obrigatório', 400, 'SOURCE_URL_MISSING');
  }

  let maxBytes = env.MEDIA_TARGET_BYTES;
  if ('max_bytes' in corpo && corpo.max_bytes !== null && corpo.max_bytes !== undefined) {
    const pedido = Number(corpo.max_bytes);
    if (!Number.isFinite(pedido) || pedido <= 0) {
      throw new AppError('Campo max_bytes inválido', 400, 'MAX_BYTES_INVALID');
    }
    // O cliente pode pedir menos que o padrão, nunca mais: quem conhece o limite
    // do destino é este serviço, e afrouxar aqui produziria arquivo recusado lá.
    maxBytes = Math.min(pedido, env.MEDIA_TARGET_BYTES);
  }

  return { sourceUrl: sourceUrl.trim(), maxBytes };
}

/**
 * @param {object} corpo      Body da requisição
 * @param {string} requestId
 * @returns {Promise<{ buffer: Buffer, meta: object }>}
 */
async function converter(corpo, requestId) {
  const { sourceUrl, maxBytes } = validarPayload(corpo);

  const entrada = buildTempPath('src', requestId);
  const saida = buildTempPath('mp4', requestId);

  try {
    const { bytes: bytesEntrada } = await baixarParaArquivo(sourceUrl, entrada, {
      requestId,
      maxBytes: env.MAX_VIDEO_BYTES,
    });

    const info = await probe(entrada, { requestId });
    if (!info.temVideo) {
      throw new AppError('O arquivo enviado não tem trilha de vídeo', 422, 'SEM_TRILHA_VIDEO');
    }

    const perfil = escolherPerfil(info.duracaoSegundos, maxBytes);

    if (!perfil.cabe) {
      // Não é falha: é a resposta correta para um vídeo longo demais. O cliente
      // precisa do número para dizer ao operador quanto cortar.
      logger.info('Vídeo longo demais para o limite', {
        requestId,
        duracaoSegundos: Math.round(info.duracaoSegundos),
        duracaoMaximaSegundos: perfil.duracaoMaximaSegundos,
      });
      const erro = new AppError(
        `Vídeo de ${Math.round(info.duracaoSegundos)}s é longo demais para caber no limite. ` +
          `O máximo é cerca de ${perfil.duracaoMaximaSegundos}s.`,
        422,
        'VIDEO_MUITO_LONGO',
      );
      erro.detalhes = {
        duracao_segundos: Math.round(info.duracaoSegundos),
        duracao_maxima_segundos: perfil.duracaoMaximaSegundos,
        max_bytes: maxBytes,
      };
      throw erro;
    }

    logger.info('Iniciando recodificação de vídeo', {
      requestId,
      bytesEntrada,
      duracaoSegundos: Math.round(info.duracaoSegundos),
      resolucaoOrigem: info.largura && info.altura ? `${info.largura}x${info.altura}` : null,
      perfil: perfil.nome,
      videoBps: perfil.videoBps,
    });

    const inicio = Date.now();
    await executarFfmpeg(montarArgsFfmpeg(entrada, saida, perfil), {
      requestId,
      timeoutMs: env.FFMPEG_VIDEO_TIMEOUT_MS,
    });
    const duracaoMs = Date.now() - inicio;

    const buffer = await fs.promises.readFile(saida);
    if (!buffer || buffer.length === 0) {
      throw new AppError('Falha ao converter vídeo', 422, 'OUTPUT_EMPTY');
    }

    // `-b:v` é alvo, não garantia. Ver o comentário no topo do arquivo.
    if (buffer.length > maxBytes) {
      logger.warn('Saída acima do alvo mesmo com bitrate calculado', {
        requestId,
        bytesSaida: buffer.length,
        maxBytes,
        perfil: perfil.nome,
      });
      throw new AppError(
        'Não foi possível reduzir o vídeo o suficiente. Tente um trecho mais curto.',
        422,
        'SAIDA_ACIMA_DO_ALVO',
      );
    }

    logger.info('Recodificação concluída', {
      requestId,
      bytesEntrada,
      bytesSaida: buffer.length,
      reducaoPct: Math.round(100 * (1 - buffer.length / bytesEntrada)),
      duracaoMs,
      perfil: perfil.nome,
    });

    return {
      buffer,
      meta: {
        perfil: perfil.nome,
        largura: perfil.largura,
        video_bps: perfil.videoBps,
        audio_bps: perfil.audioBps,
        duracao_segundos: Math.round(info.duracaoSegundos),
        bytes_entrada: bytesEntrada,
        bytes_saida: buffer.length,
        duracao_ms: duracaoMs,
      },
    };
  } finally {
    await removeTempFiles([entrada, saida], requestId);
  }
}

module.exports = { converter, validarPayload };
