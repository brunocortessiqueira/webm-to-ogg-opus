'use strict';

const fs = require('fs');
const env = require('../config/env');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

/**
 * Baixa a mídia de origem para um arquivo temporário.
 *
 * POR QUE NÃO É BASE64 COMO NO ÁUDIO
 *
 * O endpoint de áudio recebe o conteúdo embutido no JSON. Para vídeo isso não
 * tem conserto por ajuste de limite: 2 minutos gravados por um celular dão
 * 173,8 MB, que viram ~232 MB de corpo JSON — e a string base64 sozinha ocupa o
 * dobro disso na memória do Node antes mesmo de virar Buffer.
 *
 * Como o vídeo já está no Storage antes de chegar aqui, buscar pela URL troca
 * esse custo por um download em streaming, com o arquivo indo direto para o
 * disco.
 *
 * SEGURANÇA
 *
 * Buscar uma URL que o cliente escolhe é uma porta de SSRF: bastaria apontar
 * para `169.254.169.254` ou para um serviço interno da VPS. Três guardas fecham
 * isso, e nenhuma é opcional:
 *
 *   1. allowlist de hosts (`MEDIA_ALLOWED_HOSTS`) — vazia recusa tudo;
 *   2. `redirect: 'manual'` — um 302 para host de fora burlaria a allowlist se
 *      o fetch seguisse sozinho;
 *   3. corte por bytes durante o download — `content-length` é informado pela
 *      origem e pode mentir, então o limite é aplicado no que realmente chega.
 */

/**
 * @param {string} urlBruta
 * @returns {URL}
 */
function validarUrl(urlBruta) {
  if (typeof urlBruta !== 'string' || !urlBruta.trim()) {
    throw new AppError('Campo source_url é obrigatório', 400, 'SOURCE_URL_MISSING');
  }

  let url;
  try {
    url = new URL(urlBruta.trim());
  } catch {
    throw new AppError('source_url inválida', 400, 'SOURCE_URL_INVALID');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError('source_url deve usar http ou https', 400, 'SOURCE_URL_PROTOCOL');
  }

  const permitidos = env.MEDIA_ALLOWED_HOSTS;
  if (permitidos.length === 0) {
    // Falha fechada de propósito: sem allowlist configurada, o endpoint de vídeo
    // não busca nada. Melhor ficar indisponível do que virar proxy de rede interna.
    throw new AppError('Download de mídia não está habilitado neste servidor', 403, 'ALLOWLIST_VAZIA');
  }

  if (!permitidos.includes(url.hostname.toLowerCase())) {
    throw new AppError('Origem da mídia não autorizada', 403, 'HOST_NAO_AUTORIZADO');
  }

  return url;
}

/**
 * Baixa `urlBruta` para `destino`, cortando acima de `maxBytes`.
 *
 * @param {string} urlBruta
 * @param {string} destino    Caminho do arquivo a escrever
 * @param {object} [opcoes]
 * @param {string} [opcoes.requestId]
 * @param {number} [opcoes.maxBytes]
 * @param {number} [opcoes.timeoutMs]
 * @returns {Promise<{ bytes: number, contentType: string|null }>}
 */
async function baixarParaArquivo(urlBruta, destino, opcoes = {}) {
  const {
    requestId,
    maxBytes = env.MAX_VIDEO_BYTES,
    timeoutMs = env.MEDIA_FETCH_TIMEOUT_MS,
  } = opcoes;

  const url = validarUrl(urlBruta);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resposta;
  try {
    resposta = await fetch(url, { redirect: 'manual', signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new AppError('Timeout ao baixar a mídia de origem', 504, 'FETCH_TIMEOUT');
    }
    logger.warn('Falha ao baixar mídia de origem', { requestId, error: err.message });
    throw new AppError('Não foi possível baixar a mídia de origem', 502, 'FETCH_FAILED');
  }

  try {
    // Redirect chega como 3xx porque `redirect: 'manual'`. Seguir levaria a
    // saída para fora da allowlist, então é recusa — não repetição.
    if (resposta.status >= 300 && resposta.status < 400) {
      throw new AppError('A origem respondeu com redirecionamento, que não é seguido', 502, 'FETCH_REDIRECT');
    }
    if (!resposta.ok) {
      throw new AppError(`Origem respondeu HTTP ${resposta.status}`, 502, 'FETCH_HTTP_ERROR');
    }

    // Só uma triagem barata: quem manda é a contagem real, logo abaixo.
    const declarado = parseInt(resposta.headers.get('content-length') || '', 10);
    if (Number.isFinite(declarado) && declarado > maxBytes) {
      throw new AppError('Arquivo de origem excede o limite permitido', 413, 'FETCH_TOO_LARGE');
    }

    const escrita = fs.createWriteStream(destino);
    let bytes = 0;

    try {
      for await (const pedaco of resposta.body) {
        bytes += pedaco.length;
        if (bytes > maxBytes) {
          throw new AppError('Arquivo de origem excede o limite permitido', 413, 'FETCH_TOO_LARGE');
        }
        if (!escrita.write(pedaco)) {
          await new Promise((r) => escrita.once('drain', r));
        }
      }
      await new Promise((resolve, reject) => {
        escrita.end(() => resolve());
        escrita.on('error', reject);
      });
    } catch (err) {
      escrita.destroy();
      throw err;
    }

    if (bytes === 0) {
      throw new AppError('Arquivo de origem está vazio', 422, 'FETCH_EMPTY');
    }

    logger.info('Mídia de origem baixada', {
      requestId,
      host: url.hostname,
      bytes,
    });

    return { bytes, contentType: resposta.headers.get('content-type') };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { baixarParaArquivo, validarUrl };
