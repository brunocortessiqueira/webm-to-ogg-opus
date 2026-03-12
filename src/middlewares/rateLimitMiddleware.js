'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const apiResponse = require('../utils/apiResponse');

const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    return apiResponse.error(res, 'Muitas requisições. Tente novamente mais tarde.', 429);
  },
});

module.exports = rateLimitMiddleware;
