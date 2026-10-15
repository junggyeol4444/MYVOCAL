// Local-only permission policy for Learning Studio assets. No network or uploads.
export const RIGHTS_CATEGORIES = Object.freeze(['self-created', 'self-identity', 'licensed', 'reference-only']);
const TRAINING = new Set(['self-created', 'self-identity', 'licensed']);
export function createLearningRights({category, consentConfirmed = false, sourceLabel = '', licenseNote = ''} = {}) {
  if (!RIGHTS_CATEGORIES.includes(category)) throw new TypeError('Unknown learning rights category');
  if (typeof consentConfirmed !== 'boolean') throw new TypeError('Consent must be boolean');
  if (typeof sourceLabel !== 'string' || typeof licenseNote !== 'string') throw new TypeError('Invalid rights metadata');
  if (category === 'licensed' && !licenseNote.trim()) throw new Error('Licensed material requires a permission note');
  return Object.freeze({version: 1, category, consentConfirmed, sourceLabel: sourceLabel.trim(), licenseNote: licenseNote.trim()});
}
export function canUseLearningAsset(rights, purpose) {
  if (!rights || !RIGHTS_CATEGORIES.includes(rights.category) || rights.consentConfirmed !== true) return false;
  if (purpose === 'reference-analysis') return true;
  if (purpose === 'model-training' || purpose === 'style-learning') return TRAINING.has(rights.category) && (rights.category !== 'licensed' || Boolean(rights.licenseNote?.trim()));
  return false;
}
export function assertLearningPermission(rights, purpose) {
  if (!canUseLearningAsset(rights, purpose)) throw new Error('Learning asset permission denied: ' + String(purpose));
  return true;
}
