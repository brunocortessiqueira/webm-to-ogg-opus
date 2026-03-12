'use strict';

const env = require('../config/env');
const apiResponse = require('../utils/apiResponse');

/**
 * Middleware de autenticação via Bearer token.
 * Retorna 401 se o header Authorization estiver ausente ou o token for inválido.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return apiResponse.error(res, 'Bearer token ausente', 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return apiResponse.error(res, 'Bearer token ausente', 401);
  }

  const token = parts[1];
  if (!token || token !== env.API_KEY) {
    return apiResponse.error(res, 'Token inválido', 401);
  }

  next();
}

module.exports = authMiddleware;
