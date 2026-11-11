'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/** Read and parse a JSON file. Returns `fallback` when the file is absent or invalid. */
function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[store] Не удалось прочитать ${path.basename(file)}: ${error.message}`);
    }
    return fallback;
  }
}

/** Atomic JSON write: write to a temp file, fsync, then rename. */
function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/** Deep merge plain objects. Arrays and primitives are replaced. */
function deepMerge(base, extra) {
  if (!isPlainObject(base) || !isPlainObject(extra)) {
    return extra === undefined ? base : extra;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function cleanString(value, maxLength = 500, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

function safeFileName(name, fallback = 'note') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function uuid() {
  return crypto.randomUUID();
}

function backupRotation(dir, keep = 10) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('backup-') && name.endsWith('.json'))
      .sort();
    while (files.length > keep) {
      const old = files.shift();
      fs.rmSync(path.join(dir, old), { force: true });
    }
  } catch {
    /* non-critical */
  }
}

module.exports = {
  readJson,
  writeJsonAtomic,
  deepMerge,
  isPlainObject,
  clamp,
  cleanString,
  safeFileName,
  uuid,
  backupRotation,
};
