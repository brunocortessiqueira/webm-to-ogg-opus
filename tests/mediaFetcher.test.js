'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MEDIA_ALLOWED_HOSTS = 'storage.exemplo.com, CDN.Exemplo.com';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { validarUrl, baixarParaArquivo } = require('../src/infra/mediaFetcher');

/**
 * Estes testes existem por causa de SSRF.
 *
 * O endpoint de vídeo busca uma URL que o cliente escolhe. Sem as guardas
 * abaixo, o serviço vira um proxy para a rede interna da VPS — o metadata do
 * provedor, o Postgres, o Redis. Cada teste aqui trava uma das guardas.
 */

describe('validarUrl — allowlist de hosts', () => {
  it('aceita host da allowlist', () => {
    expect(() => validarUrl('https://storage.exemplo.com/a/b.mp4')).not.toThrow();
  });

  it('compara host sem diferenciar maiúsculas', () => {
    expect(() => validarUrl('https://STORAGE.exemplo.COM/a/b.mp4')).not.toThrow();
    expect(() => validarUrl('https://cdn.exemplo.com/a/b.mp4')).not.toThrow();
  });

  it('recusa host fora da allowlist', () => {
    expect(() => validarUrl('https://evil.com/a.mp4')).toThrow(/não autorizada/i);
  });

  it('recusa endereço de metadata da nuvem', () => {
    expect(() => validarUrl('http://169.254.169.254/latest/meta-data/')).toThrow(/não autorizada/i);
  });

  it('recusa localhost e rede interna', () => {
    expect(() => validarUrl('http://localhost:5432/')).toThrow(/não autorizada/i);
    expect(() => validarUrl('http://127.0.0.1:6379/')).toThrow(/não autorizada/i);
    expect(() => validarUrl('http://supabase-db:5432/')).toThrow(/não autorizada/i);
  });

  it('não se deixa enganar por host embutido em userinfo ou caminho', () => {
    // `https://storage.exemplo.com@evil.com/` tem hostname evil.com.
    expect(() => validarUrl('https://storage.exemplo.com@evil.com/a.mp4')).toThrow(/não autorizada/i);
    expect(() => validarUrl('https://evil.com/storage.exemplo.com/a.mp4')).toThrow(/não autorizada/i);
  });
});

describe('validarUrl — protocolo e formato', () => {
  it('recusa protocolo que não seja http(s)', () => {
    expect(() => validarUrl('file:///etc/passwd')).toThrow(/http/i);
    expect(() => validarUrl('gopher://storage.exemplo.com/')).toThrow(/http/i);
    expect(() => validarUrl('data:video/mp4;base64,AAAA')).toThrow(/http/i);
  });

  it('recusa URL malformada ou ausente', () => {
    expect(() => validarUrl('nao é uma url')).toThrow(/inválida/i);
    expect(() => validarUrl('')).toThrow(/obrigatório/i);
    expect(() => validarUrl(null)).toThrow(/obrigatório/i);
    expect(() => validarUrl(undefined)).toThrow(/obrigatório/i);
  });
});

describe('validarUrl — allowlist vazia', () => {
  it('recusa tudo quando não há hosts configurados', () => {
    jest.resetModules();
    process.env.MEDIA_ALLOWED_HOSTS = '';
    const semLista = require('../src/infra/mediaFetcher');

    // Falha fechada: sem configuração, o endpoint não busca nada.
    expect(() => semLista.validarUrl('https://storage.exemplo.com/a.mp4')).toThrow(/não está habilitado/i);

    process.env.MEDIA_ALLOWED_HOSTS = 'storage.exemplo.com, CDN.Exemplo.com';
    jest.resetModules();
  });
});

describe('baixarParaArquivo — limites e redirect', () => {
  const destino = path.join(os.tmpdir(), `fetcher-teste-${Date.now()}.bin`);

  afterEach(() => {
    jest.restoreAllMocks();
    try { fs.unlinkSync(destino); } catch { /* pode não existir */ }
  });

  /** Monta uma resposta de fetch com corpo em pedaços. */
  function respostaCom(pedacos, { status = 200, headers = {} } = {}) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      body: (async function* () { for (const p of pedacos) yield p; })(),
    };
  }

  it('grava o arquivo e devolve os bytes contados', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      respostaCom([Buffer.alloc(1000, 7), Buffer.alloc(500, 7)], {
        headers: { 'content-type': 'video/mp4' },
      }),
    );

    const r = await baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino, { maxBytes: 10000 });

    expect(r.bytes).toBe(1500);
    expect(fs.statSync(destino).size).toBe(1500);
  });

  it('corta durante o download, sem confiar no content-length', async () => {
    // A origem mente: diz 10 bytes e manda 5000.
    jest.spyOn(global, 'fetch').mockResolvedValue(
      respostaCom([Buffer.alloc(5000, 7)], { headers: { 'content-length': '10' } }),
    );

    await expect(
      baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino, { maxBytes: 1000 }),
    ).rejects.toThrow(/excede o limite/i);
  });

  it('recusa quando o content-length já anuncia excesso', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      respostaCom([], { headers: { 'content-length': String(999 * 1024 * 1024) } }),
    );

    await expect(
      baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino, { maxBytes: 1000 }),
    ).rejects.toThrow(/excede o limite/i);
  });

  it('não segue redirect — seguir burlaria a allowlist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      respostaCom([], { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );

    await expect(
      baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino),
    ).rejects.toThrow(/redirecionamento/i);
  });

  it('propaga erro HTTP da origem', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(respostaCom([], { status: 404 }));
    await expect(
      baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('recusa corpo vazio', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(respostaCom([]));
    await expect(
      baixarParaArquivo('https://storage.exemplo.com/a.mp4', destino),
    ).rejects.toThrow(/vazio/i);
  });

  it('valida o host antes de tocar na rede', async () => {
    const espiao = jest.spyOn(global, 'fetch');
    await expect(baixarParaArquivo('https://evil.com/a.mp4', destino)).rejects.toThrow(/não autorizada/i);
    expect(espiao).not.toHaveBeenCalled();
  });
});
