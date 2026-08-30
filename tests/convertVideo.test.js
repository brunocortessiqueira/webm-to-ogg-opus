'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MEDIA_ALLOWED_HOSTS = 'storage.exemplo.com,cdn.exemplo.com';
process.env.MEDIA_TARGET_BYTES = String(16 * 1024 * 1024);

const request = require('supertest');

// O ffmpeg e o ffprobe não existem no ambiente de teste, e o download não deve
// sair para a rede. Cada um é substituído no seu limite.
jest.mock('../src/infra/ffmpegRunner', () => ({
  runFfmpeg: jest.fn(),
  executarFfmpeg: jest.fn(),
}));
jest.mock('../src/infra/ffprobeRunner', () => ({
  probe: jest.fn(),
}));
jest.mock('../src/infra/mediaFetcher', () => ({
  baixarParaArquivo: jest.fn(),
  validarUrl: jest.fn(),
}));
jest.mock('../src/infra/tempFileManager', () => ({
  buildTempPath: jest.fn((ext, requestId) => `/tmp/media-${requestId}.${ext}`),
  writeTempFile: jest.fn(),
  readTempFile: jest.fn(),
  removeTempFiles: jest.fn(),
}));

const fs = require('fs');
const app = require('../src/app');
const { executarFfmpeg } = require('../src/infra/ffmpegRunner');
const { probe } = require('../src/infra/ffprobeRunner');
const { baixarParaArquivo } = require('../src/infra/mediaFetcher');
const { removeTempFiles } = require('../src/infra/tempFileManager');

const AUTH = { Authorization: 'Bearer test-secret-key' };
const URL_OK = 'https://storage.exemplo.com/chat-media/t/abc.mp4';

/** O readFile do serviço lê a saída do ffmpeg; aqui devolvemos um MP4 de mentira. */
function saidaComTamanho(bytes) {
  jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.alloc(bytes, 1));
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  baixarParaArquivo.mockResolvedValue({ bytes: 100 * 1024 * 1024, contentType: 'video/mp4' });
  probe.mockResolvedValue({
    duracaoSegundos: 120,
    largura: 1920,
    altura: 1080,
    temVideo: true,
    temAudio: true,
  });
  executarFfmpeg.mockResolvedValue(undefined);
  saidaComTamanho(13 * 1024 * 1024);
});

describe('POST /convert/video — autenticação', () => {
  it('exige Bearer token, como o endpoint de áudio', async () => {
    const semToken = await request(app).post('/convert/video').send({ source_url: URL_OK });
    expect(semToken.status).toBe(401);

    const tokenErrado = await request(app)
      .post('/convert/video')
      .set({ Authorization: 'Bearer errado' })
      .send({ source_url: URL_OK });
    expect(tokenErrado.status).toBe(401);
  });
});

describe('POST /convert/video — caminho feliz', () => {
  it('devolve o MP4 binário, não JSON com base64', async () => {
    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^video\/mp4/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBe(13 * 1024 * 1024);
  });

  it('informa o perfil escolhido nos headers', async () => {
    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });

    // 120 s no teto de 16 MB cai em 480p — ver videoProfile.test.js
    expect(res.headers['x-convert-perfil']).toBe('480p');
    expect(Number(res.headers['x-convert-duracao-segundos'])).toBe(120);
    expect(Number(res.headers['x-convert-bytes-saida'])).toBe(13 * 1024 * 1024);
  });

  it('passa ao ffmpeg os argumentos de vídeo, e o timeout de vídeo', async () => {
    await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });

    const [args, opcoes] = executarFfmpeg.mock.calls[0];
    expect(args).toContain('libx264');
    expect(args).not.toContain('-vn'); // o `-vn` do áudio descartaria o vídeo
    expect(opcoes.timeoutMs).toBe(180000);
  });

  it('limpa os temporários mesmo quando dá tudo certo', async () => {
    await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });
    expect(removeTempFiles).toHaveBeenCalled();
  });
});

describe('POST /convert/video — vídeo longo demais', () => {
  it('recusa com 422 e diz qual é a duração máxima', async () => {
    probe.mockResolvedValue({
      duracaoSegundos: 600,
      largura: 1920, altura: 1080, temVideo: true, temAudio: true,
    });

    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VIDEO_MUITO_LONGO');
    expect(res.body.detalhes.duracao_maxima_segundos).toBeGreaterThan(0);
    expect(res.body.detalhes.duracao_segundos).toBe(600);
    // Não adianta gastar CPU num vídeo que já se sabe que não cabe.
    expect(executarFfmpeg).not.toHaveBeenCalled();
  });

  it('limpa os temporários também quando recusa', async () => {
    probe.mockResolvedValue({
      duracaoSegundos: 600, largura: 1920, altura: 1080, temVideo: true, temAudio: true,
    });
    await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });
    expect(removeTempFiles).toHaveBeenCalled();
  });
});

describe('POST /convert/video — saída fora do alvo', () => {
  it('recusa saída acima do teto em vez de entregar arquivo que a Meta rejeita', async () => {
    // `-b:v` é alvo, não garantia: cena de muito movimento pode estourar.
    saidaComTamanho(20 * 1024 * 1024);

    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SAIDA_ACIMA_DO_ALVO');
  });

  it('recusa saída vazia', async () => {
    saidaComTamanho(0);
    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('OUTPUT_EMPTY');
  });
});

describe('POST /convert/video — validação do payload', () => {
  it('exige source_url', async () => {
    const res = await request(app).post('/convert/video').set(AUTH).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SOURCE_URL_MISSING');
  });

  it('recusa max_bytes inválido', async () => {
    const res = await request(app)
      .post('/convert/video').set(AUTH)
      .send({ source_url: URL_OK, max_bytes: -1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MAX_BYTES_INVALID');
  });

  it('aceita max_bytes menor que o padrão, e ignora pedido maior', async () => {
    // Pedir mais que o limite do destino produziria arquivo recusado lá na frente.
    probe.mockResolvedValue({
      duracaoSegundos: 300, largura: 1920, altura: 1080, temVideo: true, temAudio: true,
    });
    const res = await request(app)
      .post('/convert/video').set(AUTH)
      .send({ source_url: URL_OK, max_bytes: 999 * 1024 * 1024 });

    // 300 s não cabe nos 16 MB — se o max_bytes gigante tivesse valido, caberia.
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VIDEO_MUITO_LONGO');
  });

  it('recusa arquivo sem trilha de vídeo', async () => {
    probe.mockResolvedValue({
      duracaoSegundos: 30, largura: null, altura: null, temVideo: false, temAudio: true,
    });
    const res = await request(app).post('/convert/video').set(AUTH).send({ source_url: URL_OK });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SEM_TRILHA_VIDEO');
  });
});

describe('POST /convert — o endpoint de áudio segue intacto', () => {
  it('continua existindo e devolvendo o formato antigo', async () => {
    const { readTempFile } = require('../src/infra/tempFileManager');
    readTempFile.mockResolvedValue(Buffer.from('ogg-falso'));

    const res = await request(app)
      .post('/convert').set(AUTH)
      .send({ audio: Buffer.from('audio').toString('base64'), mimetype: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.mimetype).toBe('audio/ogg');
    expect(typeof res.body.audio).toBe('string');
  });
});
