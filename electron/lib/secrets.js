'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const { getPaths } = require('./paths');
const { readJson, writeJsonAtomic } = require('./util');

const AAD = Buffer.from('nmb-notes:secrets:v1');

function safeStorageAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function storageBackend() {
  try {
    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend();
    }
    if (process.platform === 'darwin') return 'Keychain';
    if (process.platform === 'win32') return 'DPAPI';
    return 'safeStorage';
  } catch {
    return 'unknown';
  }
}

function getFallbackKey() {
  const { secretKeyFile } = getPaths();
  try {
    const raw = fs.readFileSync(secretKeyFile, 'utf8').trim();
    const key = Buffer.from(raw, 'base64');
    if (key.length === 32) return key;
  } catch {
    /* create below */
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(require('node:path').dirname(secretKeyFile), { recursive: true });
  fs.writeFileSync(secretKeyFile, key.toString('base64'), { mode: 0o600 });
  try {
    fs.chmodSync(secretKeyFile, 0o600);
  } catch {
    /* best effort on Windows */
  }
  return key;
}

function encrypt(value) {
  if (safeStorageAvailable()) {
    const encrypted = safeStorage.encryptString(value);
    return {
      version: 1,
      method: 'safeStorage',
      backend: storageBackend(),
      data: encrypted.toString('base64'),
    };
  }
  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const payload = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    version: 1,
    method: 'aes-256-gcm',
    backend: 'local-aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: payload.toString('base64'),
  };
}

function decrypt(envelope) {
  if (!envelope || typeof envelope !== 'object' || typeof envelope.data !== 'string') {
    throw new Error('Повреждённый файл секретов');
  }
  if (envelope.method === 'safeStorage') {
    if (!safeStorageAvailable()) {
      throw new Error('Системное хранилище ключей недоступно');
    }
    const buf = Buffer.from(envelope.data, 'base64');
    return safeStorage.decryptString(buf);
  }
  if (envelope.method === 'aes-256-gcm') {
    const key = getFallbackKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv || '', 'base64')
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag || '', 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  throw new Error('Неизвестный метод шифрования');
}

function readEnvelope() {
  const { secretsFile } = getPaths();
  return readJson(secretsFile, null);
}

/** Returns the API key or null. Never expose the result to the renderer. */
function getApiKey() {
  const envelope = readEnvelope();
  if (!envelope) return null;
  try {
    const value = decrypt(envelope).trim();
    return value || null;
  } catch (error) {
    console.warn('[secrets] Не удалось расшифровать ключ:', error.message);
    return null;
  }
}

function setApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (key.length < 8) throw new Error('Ключ слишком короткий');
  if (key.length > 500) throw new Error('Ключ слишком длинный');
  if (/[\u0000-\u001f\s]/.test(key)) throw new Error('Ключ содержит недопустимые символы');
  const { secretsFile } = getPaths();
  const envelope = encrypt(key);
  writeJsonAtomic(secretsFile, envelope);
  try {
    fs.chmodSync(secretsFile, 0o600);
  } catch {
    /* best effort */
  }
  return keyStatus();
}

function clearApiKey() {
  const { secretsFile, secretKeyFile } = getPaths();
  fs.rmSync(secretsFile, { force: true });
  fs.rmSync(secretKeyFile, { force: true });
  return keyStatus();
}

function keyStatus() {
  const envelope = readEnvelope();
  const key = getApiKey();
  return {
    set: Boolean(key),
    hint: key ? `••••${key.slice(-4)}` : '',
    method: envelope?.method || 'none',
    backend: envelope?.backend || (safeStorageAvailable() ? storageBackend() : 'aes-256-gcm'),
    cipher: envelope?.method === 'safeStorage' ? 'safeStorage' : envelope ? 'AES-256-GCM' : '—',
  };
}

module.exports = {
  getApiKey,
  setApiKey,
  clearApiKey,
  keyStatus,
  safeStorageAvailable,
  storageBackend,
};
