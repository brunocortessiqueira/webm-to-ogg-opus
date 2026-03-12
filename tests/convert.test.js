'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MAX_AUDIO_BYTES = String(25 * 1024 * 1024);

const request = require('supertest');

// Mock do ffmpegRunner para evitar dependência do ffmpeg nos testes
jest.mock('../src/infra/ffmpegRunner', () => ({
  runFfmpeg: jest.fn(),
}));

// Mock do tempFileManager para controlar arquivos temporários
jest.mock('../src/infra/tempFileManager', () => ({
  buildTempPath: jest.fn((ext, requestId) => `/tmp/audio-${requestId}.${ext}`),
  writeTempFile: jest.fn(),
  readTempFile: jest.fn(),
  removeTempFiles: jest.fn(),
}));

const app = require('../src/app');
const { runFfmpeg } = require('../src/infra/ffmpegRunner');
const { readTempFile } = require('../src/infra/tempFileManager');

const AUTH = { Authorization: 'Bearer test-secret-key' };

// Base64 de um dado qualquer (simulando áudio)
const FAKE_AUDIO_BASE64 = Buffer.from('fake-audio-content').toString('base64');
const FAKE_OGG_BUFFER = Buffer.from('fake-ogg-content');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /convert - validação de payload', () => {
  it('deve retornar 400 quando body está ausente / vazio', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/audio|mimetype/i);
  });

  it('deve retornar 400 quando campo audio está ausente', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ mimetype: 'audio/webm' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/audio/i);
  });

  it('deve retornar 400 quando campo mimetype está ausente', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64 });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/mimetype/i);
  });

  it('deve retornar 400 quando audio não é string', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: 12345, mimetype: 'audio/webm' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/audio/i);
  });

  it('deve retornar 400 quando audio é base64 inválido (caracteres inválidos)', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: '!!@@##$$%%', mimetype: 'audio/webm' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/base64/i);
  });

  it('deve retornar 400 quando audio é string vazia', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: '', mimetype: 'audio/webm' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
  });

  it('deve retornar 400 quando mimetype não é string', async () => {
    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 123 });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toMatch(/mimetype/i);
  });

  it('deve retornar 400 para JSON inválido no body', async () => {
    const res = await request(app)
      .post('/convert')
      .set({ ...AUTH, 'Content-Type': 'application/json' })
      .send('{ invalid json }');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('JSON inválido');
  });

  it('deve retornar 413 quando payload excede limite configurado', async () => {
    // Gera base64 de um buffer maior que MAX_AUDIO_BYTES
    const overLimit = Buffer.alloc(26 * 1024 * 1024, 'a');
    const bigBase64 = overLimit.toString('base64');

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: bigBase64, mimetype: 'audio/webm' });

    // Pode ser 413 (payload grande) em qualquer ponto
    expect([400, 413]).toContain(res.status);
    expect(res.body.status).toBe(false);
  });
});

describe('POST /convert - conversão com ffmpeg simulado', () => {
  it('deve retornar 200 com audio OGG em base64 quando conversão tem sucesso', async () => {
    runFfmpeg.mockResolvedValue(undefined);
    readTempFile.mockResolvedValue(FAKE_OGG_BUFFER);

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.erro).toBe('');
    expect(res.body.mimetype).toBe('audio/ogg');
    expect(res.body.audio).toBe(FAKE_OGG_BUFFER.toString('base64'));
  });

  it('deve aceitar data URI no campo audio', async () => {
    runFfmpeg.mockResolvedValue(undefined);
    readTempFile.mockResolvedValue(FAKE_OGG_BUFFER);

    const dataUri = `data:audio/webm;base64,${FAKE_AUDIO_BASE64}`;

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: dataUri, mimetype: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.mimetype).toBe('audio/ogg');
  });

  it('deve retornar 422 quando ffmpeg falha com erro de conversão', async () => {
    const AppError = require('../src/utils/appError');
    runFfmpeg.mockRejectedValue(new AppError('Falha ao converter áudio', 422, 'FFMPEG_NONZERO_EXIT'));

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Falha ao converter áudio');
  });

  it('deve retornar 504 quando ffmpeg atinge timeout', async () => {
    const AppError = require('../src/utils/appError');
    runFfmpeg.mockRejectedValue(new AppError('Timeout na conversão do áudio', 504, 'FFMPEG_TIMEOUT'));

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.status).toBe(504);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Timeout na conversão do áudio');
  });

  it('deve retornar 500 quando ffmpeg não está instalado', async () => {
    const AppError = require('../src/utils/appError');
    runFfmpeg.mockRejectedValue(new AppError('ffmpeg não encontrado no sistema', 500, 'FFMPEG_NOT_FOUND'));

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.status).toBe(500);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('ffmpeg não encontrado no sistema');
  });

  it('deve remover arquivos temporários mesmo quando ffmpeg falha', async () => {
    const { removeTempFiles } = require('../src/infra/tempFileManager');
    const AppError = require('../src/utils/appError');
    runFfmpeg.mockRejectedValue(new AppError('Falha ao converter áudio', 422, 'FFMPEG_NONZERO_EXIT'));

    await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(removeTempFiles).toHaveBeenCalled();
  });

  it('deve retornar 422 quando arquivo de saída está vazio', async () => {
    runFfmpeg.mockResolvedValue(undefined);
    readTempFile.mockResolvedValue(Buffer.alloc(0));

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe(false);
    expect(res.body.erro).toBe('Falha ao converter áudio');
  });

  it('não deve expor stack trace na resposta de erro', async () => {
    runFfmpeg.mockRejectedValue(new Error('Erro interno inesperado com stack'));

    const res = await request(app)
      .post('/convert')
      .set(AUTH)
      .send({ audio: FAKE_AUDIO_BASE64, mimetype: 'audio/webm' });

    expect(res.body.erro).not.toMatch(/stack|at\s+\w+/i);
    expect(res.body).not.toHaveProperty('stack');
  });
});
