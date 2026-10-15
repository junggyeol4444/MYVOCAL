// Step52: local music registration manifest. Never uploads or alters original media.
import { createLearningRights, canUseLearningAsset } from './learningRights.js';
const EXTENSIONS = new Set(['wav', 'flac', 'mp3', 'ogg', 'm4a', 'aiff', 'mid', 'midi']);
export function registerLocalMusic({id, title, relativePath, rights, byteLength, sha256, createdAt = ''}, existing = []) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid music ID');
  if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new Error('Invalid title');
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath) || relativePath.split('/').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f]/.test(p))) throw new Error('Unsafe media path');
  const ext = relativePath.split('.').at(-1)?.toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new Error('Unsupported music format');
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new Error('Invalid media length');
  if (typeof sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(sha256)) throw new Error('Invalid SHA-256');
  if (typeof createdAt !== 'string') throw new Error('Invalid timestamp');
  if (!rights || !['self-created', 'self-identity', 'licensed', 'reference-only'].includes(rights.category)) throw new Error('Invalid rights');
  // Revalidate rather than trusting an arbitrary serialized rights object.
  const checked = createLearningRights(rights);
  if (!checked.consentConfirmed) throw new Error('Rights confirmation required');
  if (!Array.isArray(existing)) throw new Error('Invalid library');
  if (existing.some(item => item.id === id || item.sha256?.toLowerCase() === sha256.toLowerCase())) throw new Error('Duplicate music registration');
  return Object.freeze({version: 1, id, title: title.trim(), relativePath, byteLength, sha256: sha256.toLowerCase(), rights: checked, createdAt});
}
export function listMusicForPurpose(library, purpose) {
  if (!Array.isArray(library)) throw new TypeError('Invalid library');
  return library.filter(item => canUseLearningAsset(item?.rights, purpose));
}
