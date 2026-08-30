'use strict';

process.env.API_KEY = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { escolherPerfil, montarArgsFfmpeg } = require('../src/services/videoProfile');

const MB = 1024 * 1024;
const TETO = 16 * MB;

/** Estima o tamanho final a partir do bitrate escolhido — a conta que o perfil promete cumprir. */
function bytesEstimados(perfil, duracaoSegundos) {
  return ((perfil.videoBps + perfil.audioBps) * duracaoSegundos) / 8;
}

describe('escolherPerfil — a promessa central', () => {
  // Se este teste cair, o serviço volta a produzir arquivo que a Meta recusa.
  it('nunca escolhe bitrate que estoure o teto, em nenhuma duração', () => {
    for (let s = 1; s <= 240; s++) {
      const p = escolherPerfil(s, TETO);
      if (!p.cabe) continue;
      const estimado = bytesEstimados(p, s);
      expect(estimado).toBeLessThanOrEqual(TETO);
    }
  });

  it('degrada a resolução conforme o vídeo alonga', () => {
    expect(escolherPerfil(30, TETO).nome).toBe('720p');
    expect(escolherPerfil(60, TETO).nome).toBe('720p');
    expect(escolherPerfil(120, TETO).nome).toBe('480p');
    expect(escolherPerfil(180, TETO).nome).toBe('360p');
  });

  it('o bitrate cai quando a duração sobe', () => {
    const curto = escolherPerfil(60, TETO);
    const medio = escolherPerfil(120, TETO);
    const longo = escolherPerfil(180, TETO);
    expect(curto.videoBps).toBeGreaterThan(medio.videoBps);
    expect(medio.videoBps).toBeGreaterThan(longo.videoBps);
  });

  it('não gasta bitrate além do que a resolução aproveita', () => {
    // Um vídeo de 3 s teria orçamento para dezenas de Mbps; 720p não usa isso.
    const p = escolherPerfil(3, TETO);
    expect(p.nome).toBe('720p');
    expect(p.videoBps).toBeLessThanOrEqual(1400000 * 2.2);
  });
});

describe('escolherPerfil — quando recusar', () => {
  it('recusa vídeo longo demais em vez de entregar algo ilegível', () => {
    const p = escolherPerfil(600, TETO);
    expect(p.cabe).toBe(false);
    expect(p.duracaoMaximaSegundos).toBeGreaterThan(0);
  });

  it('a duração máxima informada é de fato o ponto de virada', () => {
    const p = escolherPerfil(600, TETO);
    const limite = p.duracaoMaximaSegundos;

    // Logo abaixo do limite ainda cabe; bem acima, não.
    expect(escolherPerfil(limite - 5, TETO).cabe).toBe(true);
    expect(escolherPerfil(limite + 60, TETO).cabe).toBe(false);
  });

  it('o teto fica em torno de 4 minutos para o limite do WhatsApp', () => {
    const p = escolherPerfil(600, TETO);
    expect(p.duracaoMaximaSegundos).toBeGreaterThan(200);
    expect(p.duracaoMaximaSegundos).toBeLessThan(300);
  });

  it('teto menor encolhe a duração aceita', () => {
    const cheio = escolherPerfil(600, TETO).duracaoMaximaSegundos;
    const metade = escolherPerfil(600, TETO / 2).duracaoMaximaSegundos;
    expect(metade).toBeLessThan(cheio);
  });
});

describe('escolherPerfil — entradas inválidas', () => {
  it('rejeita duração não positiva ou não numérica', () => {
    expect(() => escolherPerfil(0, TETO)).toThrow(TypeError);
    expect(() => escolherPerfil(-10, TETO)).toThrow(TypeError);
    expect(() => escolherPerfil(NaN, TETO)).toThrow(TypeError);
    expect(() => escolherPerfil(Infinity, TETO)).toThrow(TypeError);
  });

  it('rejeita teto não positivo', () => {
    expect(() => escolherPerfil(60, 0)).toThrow(TypeError);
    expect(() => escolherPerfil(60, -1)).toThrow(TypeError);
  });
});

describe('montarArgsFfmpeg', () => {
  it('mantém a proporção e força altura par (exigência do yuv420p)', () => {
    const args = montarArgsFfmpeg('/tmp/e.mp4', '/tmp/s.mp4', escolherPerfil(120, TETO));
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toMatch(/^scale=\d+:-2$/);
  });

  it('limita o pico com maxrate, não só o bitrate médio', () => {
    const perfil = escolherPerfil(120, TETO);
    const args = montarArgsFfmpeg('/tmp/e.mp4', '/tmp/s.mp4', perfil);
    expect(args[args.indexOf('-b:v') + 1]).toBe(String(perfil.videoBps));
    expect(args[args.indexOf('-maxrate') + 1]).toBe(String(perfil.videoBps));
    expect(args).toContain('-bufsize');
  });

  it('produz MP4 que o WhatsApp começa a exibir sem baixar tudo', () => {
    const args = montarArgsFfmpeg('/tmp/e.mp4', '/tmp/s.mp4', escolherPerfil(60, TETO));
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
  });

  it('NÃO descarta a trilha de vídeo — o erro que o caminho de áudio cometeria', () => {
    const args = montarArgsFfmpeg('/tmp/e.mp4', '/tmp/s.mp4', escolherPerfil(60, TETO));
    expect(args).not.toContain('-vn');
  });

  it('entrada e saída entram como argumentos separados, sem shell', () => {
    const args = montarArgsFfmpeg('/tmp/com espaço.mp4', '/tmp/saida.mp4', escolherPerfil(60, TETO));
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/com espaço.mp4');
    expect(args[args.length - 1]).toBe('/tmp/saida.mp4');
  });
});
