'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const { getPaths } = require('./paths');
const { readJson, writeJsonAtomic } = require('./util');

const AAD = Buffer.from('nmb-notes:secrets:v1');
const DEEPSEEK = 'deepseek';
const GITHUB = 'github';

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
  fs.mkdirSync(path.dirname(secretKeyFile), { recursive: true });
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
    return safeStorage.decryptString(Buffer.from(envelope.data, 'base64'));
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

/** Хранилище секретов: { deepseek: "...", github: "..." } в одном шифре. */
function readPayload() {
  const envelope = readEnvelope();
  if (!envelope) return {};
  try {
    const raw = decrypt(envelope).trim();
    if (!raw) return {};
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    }
    // Совместимость со старым форматом: один ключ DeepSeek.
    return { [DEEPSEEK]: raw };
  } catch (error) {
    console.warn('[secrets] Не удалось расшифровать секреты:', error.message);
    return {};
  }
}

function writePayload(payload) {
  const { secretsFile, secretKeyFile } = getPaths();
  const data = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (typeof value === 'string' && value) data[key] = value;
  }
  if (Object.keys(data).length === 0) {
    fs.rmSync(secretsFile, { force: true });
    fs.rmSync(secretKeyFile, { force: true });
    return;
  }
  writeJsonAtomic(secretsFile, encrypt(JSON.stringify(data)));
  try {
    fs.chmodSync(secretsFile, 0o600);
  } catch {
    /* best effort */
  }
}

function cleanSecret(rawValue, label) {
  const value = String(rawValue || '').trim();
  if (value.length < 8) throw new Error(`${label} слишком короткий`);
  if (value.length > 500) throw new Error(`${label} слишком длинный`);
  if (/[\u0000-\u001f\s]/.test(value)) {
    throw new Error(`${label} содержит недопустимые символы`);
  }
  return value;
}

function statusFor(name) {
  const envelope = readEnvelope();
  const value = readPayload()[name] || '';
  return {
    set: Boolean(value),
    hint: value ? `••••${value.slice(-4)}` : '',
    method: envelope?.method || 'none',
    backend: envelope?.backend || (safeStorageAvailable() ? storageBackend() : 'aes-256-gcm'),
    cipher: envelope?.method === 'safeStorage' ? 'safeStorage' : envelope ? 'AES-256-GCM' : '—',
  };
}

function setSecret(name, rawValue, label) {
  const value = cleanSecret(rawValue, label);
  const payload = readPayload();
  payload[name] = value;
  writePayload(payload);
  return statusFor(name);
}

function clearSecret(name) {
  const payload = readPayload();
  delete payload[name];
  writePayload(payload);
  return statusFor(name);
}

function getApiKey() {
  return readPayload()[DEEPSEEK] || null;
}

function setApiKey(rawKey) {
  return setSecret(DEEPSEEK, rawKey, 'Ключ');
}

function clearApiKey() {
  return clearSecret(DEEPSEEK);
}

function keyStatus() {
  return statusFor(DEEPSEEK);
}

function getGithubToken() {
  return readPayload()[GITHUB] || null;
}

function setGithubToken(rawToken) {
  return setSecret(GITHUB, rawToken, 'GitHub token');
}

function clearGithubToken() {
  return clearSecret(GITHUB);
}

function githubStatus() {
  return statusFor(GITHUB);
}

module.exports = {
  getApiKey,
  setApiKey,
  clearApiKey,
  keyStatus,
  getGithubToken,
  setGithubToken,
  clearGithubToken,
  githubStatus,
  safeStorageAvailable,
  storageBackend,
};
