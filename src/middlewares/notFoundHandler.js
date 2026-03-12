'use strict';

const apiResponse = require('../utils/apiResponse');

/**
 * Handler para rotas não encontradas (404).
 */
function notFoundHandler(req, res) {
  return apiResponse.error(res, 'Rota não encontrada', 404);
}

module.exports = notFoundHandler;
