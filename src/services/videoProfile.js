'use strict';

/**
 * Escolhe resolução e bitrate de vídeo a partir da duração.
 *
 * POR QUE ISTO EXISTE
 *
 * O WhatsApp Cloud API recusa mídia acima de 16 MB. Um celular grava 1080p a
 * ~12 Mbps, o que significa que **10 segundos** é tudo o que cabe nesse limite
 * sem recodificar — e 2 minutos dão 173,8 MB.
 *
 * Recodificar com bitrate fixo não resolve: medido num vídeo real de 2 minutos,
 * "720p a 2 Mbps" produz 28 MB e continua não cabendo. O bitrate precisa sair da
 * **duração**, porque é a duração que decide quantos bits há para gastar.
 *
 * Daí a única conta que importa aqui:
 *
 *     bits_disponiveis = teto_em_bytes x 8 x margem
 *     bitrate_total    = bits_disponiveis / duracao_em_segundos
 *
 * A margem existe porque o encoder não acerta o alvo na mosca e o container tem
 * overhead próprio; 10% cobre os dois com folga observada nos testes.
 *
 * O piso de qualidade é deliberado. Abaixo de 400 kbps em 360p o vídeo fica
 * ilegível, e entregar algo ilegível é pior que recusar: o operador perde o
 * tempo do envio e o cliente recebe uma mensagem inútil. Recusar com a duração
 * máxima na mão deixa a decisão com quem sabe o que fazer — cortar o vídeo.
 *
 * Módulo puro de propósito: sem I/O, sem ffmpeg, sem env. É onde mora a decisão,
 * e é o que dá para testar sem subir nada.
 */

/** Margem para overhead de container e imprecisão do encoder. */
const MARGEM = 0.90;

/** Reservado para a trilha de áudio, em bits por segundo. */
const AUDIO_BPS = 96000;

/**
 * Degraus de qualidade, do melhor para o pior.
 *
 * `minVideoBps` é o mínimo que faz aquela resolução valer a pena: abaixo disso,
 * descer um degrau entrega imagem melhor no mesmo orçamento de bits — 480p a
 * 600 kbps é mais assistível que 720p a 600 kbps.
 */
const DEGRAUS = [
  { nome: '720p', largura: 1280, minVideoBps: 1400000 },
  { nome: '480p', largura: 854, minVideoBps: 700000 },
  { nome: '360p', largura: 640, minVideoBps: 400000 },
];

/** Nenhuma resolução aproveita bitrate indefinidamente; acima disso é desperdício. */
const FATOR_TETO_POR_DEGRAU = 2.2;

/**
 * @typedef {object} PerfilAprovado
 * @property {true} cabe
 * @property {string} nome            Rótulo do degrau ('720p', '480p', '360p')
 * @property {number} largura         Largura alvo em pixels (altura sai da proporção)
 * @property {number} videoBps        Bitrate de vídeo a pedir ao ffmpeg
 * @property {number} audioBps        Bitrate de áudio a pedir ao ffmpeg
 *
 * @typedef {object} PerfilRecusado
 * @property {false} cabe
 * @property {number} videoBpsDisponivel   O que sobraria — abaixo do piso
 * @property {number} duracaoMaximaSegundos Até onde dá para ir no pior degrau
 */

/**
 * @param {number} duracaoSegundos
 * @param {number} tetoBytes  Limite do destino (16 MB para o WhatsApp)
 * @returns {PerfilAprovado | PerfilRecusado}
 */
function escolherPerfil(duracaoSegundos, tetoBytes) {
  if (!Number.isFinite(duracaoSegundos) || duracaoSegundos <= 0) {
    throw new TypeError('duracaoSegundos deve ser um número positivo');
  }
  if (!Number.isFinite(tetoBytes) || tetoBytes <= 0) {
    throw new TypeError('tetoBytes deve ser um número positivo');
  }

  const bitrateTotal = (tetoBytes * 8 * MARGEM) / duracaoSegundos;
  const videoBpsDisponivel = Math.floor(bitrateTotal - AUDIO_BPS);

  for (const degrau of DEGRAUS) {
    if (videoBpsDisponivel >= degrau.minVideoBps) {
      const teto = Math.floor(degrau.minVideoBps * FATOR_TETO_POR_DEGRAU);
      return {
        cabe: true,
        nome: degrau.nome,
        largura: degrau.largura,
        videoBps: Math.min(videoBpsDisponivel, teto),
        audioBps: AUDIO_BPS,
      };
    }
  }

  const pior = DEGRAUS[DEGRAUS.length - 1];
  return {
    cabe: false,
    videoBpsDisponivel,
    duracaoMaximaSegundos: Math.floor(
      (tetoBytes * 8 * MARGEM) / (pior.minVideoBps + AUDIO_BPS),
    ),
  };
}

/**
 * Argumentos do ffmpeg para o perfil escolhido.
 *
 * `-maxrate` e `-bufsize` acompanham `-b:v` porque só o bitrate médio não impede
 * o encoder de estourar o alvo em trechos de muito movimento — e estourar aqui
 * significa passar dos 16 MB e o envio falhar.
 *
 * `-vf scale=<largura>:-2` mantém a proporção e força altura par, exigência do
 * yuv420p. `-movflags +faststart` põe o índice no início do arquivo: é o que faz
 * o WhatsApp começar a exibir sem baixar tudo.
 *
 * @param {string} entrada  Caminho do arquivo de origem
 * @param {string} saida    Caminho do .mp4 a produzir
 * @param {PerfilAprovado} perfil
 * @returns {string[]}
 */
function montarArgsFfmpeg(entrada, saida, perfil) {
  return [
    '-y',
    '-i', entrada,
    '-vf', `scale=${perfil.largura}:-2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-pix_fmt', 'yuv420p',
    '-b:v', String(perfil.videoBps),
    '-maxrate', String(perfil.videoBps),
    '-bufsize', String(Math.floor(perfil.videoBps / 2)),
    '-c:a', 'aac',
    '-b:a', String(perfil.audioBps),
    '-ac', '2',
    '-movflags', '+faststart',
    saida,
  ];
}

module.exports = { escolherPerfil, montarArgsFfmpeg, DEGRAUS, MARGEM, AUDIO_BPS };
