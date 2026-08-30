'use strict';

require('dotenv').config();

/**
 * Lê a lista de hosts permitidos para download de mídia.
 *
 * O endpoint de vídeo recebe uma URL e busca o arquivo — o que, sem restrição,
 * é uma porta de SSRF: bastaria pedir `http://169.254.169.254/` ou um serviço
 * interno da VPS. A allowlist fecha isso. Vazia = nenhum host liberado, e o
 * endpoint de vídeo recusa tudo (o de áudio não usa este caminho).
 */
function lerHostsPermitidos(valor) {
  if (!valor) return [];
  return valor
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

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

  // ── vídeo ────────────────────────────────────────────────────────────────
  //
  // Os limites acima são todos dimensionados para áudio: 25 MB de entrada e
  // 30 s de ffmpeg. Vídeo joga em outra escala — 2 minutos gravados por um
  // celular dão 173,8 MB — então tem números próprios.

  /** Teto do arquivo baixado. Acima disso, recusa antes de gastar CPU. */
  MAX_VIDEO_BYTES: parseInt(process.env.MAX_VIDEO_BYTES || String(300 * 1024 * 1024), 10),

  /**
   * Recodificar roda a ~14× tempo real, então 4 minutos de vídeo levam ~17 s.
   * O teto de 180 s cobre o pior caso com folga e ainda mata processo travado.
   */
  FFMPEG_VIDEO_TIMEOUT_MS: parseInt(process.env.FFMPEG_VIDEO_TIMEOUT_MS || '180000', 10),

  /** Quanto tempo esperar pelo download da origem. */
  MEDIA_FETCH_TIMEOUT_MS: parseInt(process.env.MEDIA_FETCH_TIMEOUT_MS || '120000', 10),

  /** Alvo padrão de saída: o limite de mídia do WhatsApp Cloud API. */
  MEDIA_TARGET_BYTES: parseInt(process.env.MEDIA_TARGET_BYTES || String(16 * 1024 * 1024), 10),

  /** Hosts de onde `source_url` pode ser baixada. Ver lerHostsPermitidos. */
  MEDIA_ALLOWED_HOSTS: lerHostsPermitidos(process.env.MEDIA_ALLOWED_HOSTS),
};

if (!env.API_KEY) {
  console.error('[config] FATAL: API_KEY não definida. A aplicação não pode iniciar sem uma chave de API.');
  process.exit(1);
}

module.exports = env;
