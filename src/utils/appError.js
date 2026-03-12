'use strict';

class AppError extends Error {
  /**
   * @param {string} message  - Mensagem segura para o cliente
   * @param {number} httpStatus - Código HTTP a retornar
   * @param {string} [code]   - Código interno opcional para logs
   */
  constructor(message, httpStatus, code) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code || 'APP_ERROR';
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
