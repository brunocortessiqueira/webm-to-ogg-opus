'use strict';

const videoConversionService = require('../services/videoConversionService');
const logger = require('../utils/logger');

/**
 * POST /convert/video
 *
 * Responde com o MP4 **binário**, não com JSON contendo base64.
 *
 * O endpoint de áudio devolve base64 porque o payload é pequeno. Aqui a saída
 * chega a 16 MB, e embrulhar em base64 acrescentaria 33% de tráfego e uma cópia
 * inteira em memória dos dois lados — sem nenhum ganho, já que o cliente vai
 * repassar os bytes adiante de qualquer jeito.
 *
 * Os dados da conversão (perfil escolhido, redução obtida) vão em headers
 * `X-Convert-*`, para que o cliente possa registrá-los sem precisar de um
 * envelope JSON em volta do arquivo.
 */
async function handle(req, res, next) {
  const requestId = req.requestId;
  const startedAt = Date.now();

  try {
    const { buffer, meta } = await videoConversionService.converter(req.body, requestId);

    logger.info('Requisição concluída com sucesso', {
      requestId,
      route: 'POST /convert/video',
      durationMs: Date.now() - startedAt,
      status: 'success',
      perfil: meta.perfil,
    });

    res.status(200);
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': String(buffer.length),
      'X-Convert-Perfil': meta.perfil,
      'X-Convert-Video-Bps': String(meta.video_bps),
      'X-Convert-Duracao-Segundos': String(meta.duracao_segundos),
      'X-Convert-Bytes-Entrada': String(meta.bytes_entrada),
      'X-Convert-Bytes-Saida': String(meta.bytes_saida),
      'X-Convert-Duracao-Ms': String(meta.duracao_ms),
    });
    return res.send(buffer);
  } catch (err) {
    logger.warn('Requisição encerrada com erro', {
      requestId,
      route: 'POST /convert/video',
      durationMs: Date.now() - startedAt,
      status: 'error',
      errorCode: err.code || 'UNKNOWN',
      errorMessage: err.message,
    });

    next(err);
  }
}

module.exports = { handle };
