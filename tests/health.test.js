'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const request = require('supertest');
const app = require('../src/app');

describe('GET /health', () => {
  it('deve retornar 200 com status true e service up', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: true,
      erro: '',
      audio: '',
      mimetype: '',
      service: 'up',
    });
  });
});

describe('Rota inexistente', () => {
  it('deve retornar 404 para rota não mapeada', async () => {
    const res = await request(app).get('/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Rota não encontrada');
  });
});
