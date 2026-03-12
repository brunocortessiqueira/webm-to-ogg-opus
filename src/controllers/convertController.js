'use strict';

const audioConversionService = require('../services/audioConversionService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

async function handle(req, res, next) {
  const requestId = req.requestId;
  const startedAt = Date.now();

  try {
    const audioBase64 = await audioConversionService.convert(req.body, requestId);

    logger.info('Requisição concluída com sucesso', {
      requestId,
      route: 'POST /convert',
      durationMs: Date.now() - startedAt,
      status: 'success',
    });

    return apiResponse.success(res, audioBase64);
  } catch (err) {
    logger.warn('Requisição encerrada com erro', {
      requestId,
      route: 'POST /convert',
      durationMs: Date.now() - startedAt,
      status: 'error',
      errorCode: err.code || 'UNKNOWN',
      errorMessage: err.message,
    });

    next(err);
  }
}

module.exports = { handle };
