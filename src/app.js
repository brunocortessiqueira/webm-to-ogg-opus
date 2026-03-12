'use strict';

const express = require('express');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

const env = require('./config/env');
const logger = require('./utils/logger');
const rateLimitMiddleware = require('./middlewares/rateLimitMiddleware');
const routes = require('./routes/index');
const errorHandler = require('./middlewares/errorHandler');
const notFoundHandler = require('./middlewares/notFoundHandler');

const app = express();

// Segurança: headers HTTP
app.use(helmet());

// Confiança no proxy reverso (para rate limit por IP real)
app.set('trust proxy', 1);

// Rate limiting global
app.use(rateLimitMiddleware);

// Parser JSON com limite configurável
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

// Middleware de requestId e log de entrada
app.use((req, res, next) => {
  req.requestId = uuidv4();
  logger.info('Requisição recebida', {
    requestId: req.requestId,
    method: req.method,
    route: req.path,
  });
  next();
});

// Rotas da aplicação
app.use(routes);

// 404 - rota não encontrada
app.use(notFoundHandler);

// Handler central de erros (deve ser o último middleware)
app.use(errorHandler);

module.exports = app;
