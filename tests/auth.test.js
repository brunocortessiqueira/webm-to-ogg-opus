'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const request = require('supertest');
const app = require('../src/app');

const VALID_PAYLOAD = {
  audio: Buffer.from('fake-audio-data').toString('base64'),
  mimetype: 'audio/webm',
};

describe('Autenticação - POST /convert', () => {
  it('deve retornar 401 quando Authorization está ausente', async () => {
    const res = await request(app)
      .post('/convert')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Bearer token ausente');
    expect(res.body.audio).toBe('');
    expect(res.body.mimetype).toBe('');
  });

  it('deve retornar 401 quando Authorization tem formato incorreto (sem Bearer)', async () => {
    const res = await request(app)
      .post('/convert')
      .set('Authorization', 'Token test-secret-key')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Bearer token ausente');
  });

  it('deve retornar 401 quando token é inválido', async () => {
    const res = await request(app)
      .post('/convert')
      .set('Authorization', 'Bearer token-errado')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Token inválido');
  });

  it('deve retornar 401 quando Authorization é apenas "Bearer" sem token', async () => {
    const res = await request(app)
      .post('/convert')
      .set('Authorization', 'Bearer')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(false);
  });
});
