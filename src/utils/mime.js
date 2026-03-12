'use strict';

const mimeTypes = require('mime-types');

// Mapeamento manual de fallback para tipos comuns não cobertos pelo mime-types
const FALLBACK_MAP = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/amr': 'amr',
  'audio/3gpp': '3gp',
  'audio/opus': 'opus',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/ogg': 'ogv',
};

/**
 * Resolve a extensão de arquivo a partir de um mimetype.
 * @param {string} mimetype
 * @returns {string} extensão sem ponto
 */
function resolveExtension(mimetype) {
  const normalized = mimetype.toLowerCase().trim();

  // Tenta mime-types primeiro
  const ext = mimeTypes.extension(normalized);
  if (ext) return ext;

  // Fallback manual
  const fallback = FALLBACK_MAP[normalized];
  if (fallback) return fallback;

  // Extrai parte após "/"  como último recurso
  const parts = normalized.split('/');
  if (parts.length === 2 && parts[1]) {
    const subtype = parts[1].replace(/^x-/, '');
    return subtype;
  }

  return 'bin';
}

module.exports = { resolveExtension };
