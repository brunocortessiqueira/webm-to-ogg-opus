'use strict';

const AppError = require('../utils/appError');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Handler central de erros do Express.
 * Deve ser registrado como último middleware (4 parâmetros).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';

  if (err instanceof AppError) {
    logger.warn('AppError capturado', {
      requestId,
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.message,
    });
    return apiResponse.error(res, err.message, err.httpStatus, {
      code: err.code,
      detalhes: err.detalhes,
    });
  }

  // Erros de payload do Express (JSON malformado)
  if (err.type === 'entity.parse.failed') {
    logger.warn('JSON inválido no body', { requestId, error: err.message });
    return apiResponse.error(res, 'JSON inválido', 400);
  }

  // Payload muito grande (express.json limit)
  if (err.type === 'entity.too.large' || err.status === 413) {
    logger.warn('Payload muito grande', { requestId });
    return apiResponse.error(res, 'Arquivo excede o limite permitido', 413);
  }

  // Erros inesperados - logar sem expor detalhes
  logger.error('Erro inesperado', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  return apiResponse.error(res, 'Erro interno', 500);
}

module.exports = errorHandler;
