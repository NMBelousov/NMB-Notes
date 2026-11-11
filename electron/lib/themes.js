'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('./paths');
const { writeJsonAtomic, isPlainObject, readJson } = require('./util');

const ID_RE = /^[a-z0-9][a-z0-9-_]{1,60}$/;
const TOKEN_RE = /^[a-zA-Z][a-zA-Z0-9]{1,40}$/;

function normalizeTheme(raw, fallbackId) {
  if (!isPlainObject(raw) || !isPlainObject(raw.tokens)) {
    throw new Error('Тема должна содержать объект tokens');
  }
  const id =
    typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : fallbackId;
  if (!id || !ID_RE.test(id)) throw new Error('Некорректный id темы');
  const tokens = {};
  for (const [key, value] of Object.entries(raw.tokens)) {
    if (!TOKEN_RE.test(key)) continue;
    if (typeof value !== 'string' || value.length > 160) continue;
    if (/[<>{}]/.test(value)) continue;
    tokens[key] = value;
  }
  if (Object.keys(tokens).length < 3) throw new Error('Слишком мало токенов темы');
  return {
    id,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, 80)
        : id,
    mode: raw.mode === 'light' ? 'light' : 'dark',
    credit:
      typeof raw.credit === 'string' ? raw.credit.trim().slice(0, 300) : '',
    tokens,
    css: typeof raw.css === 'string' ? raw.css.slice(0, 30000) : '',
    source: 'user',
  };
}

function listThemes() {
  const { themesDir } = getPaths();
  try {
    fs.mkdirSync(themesDir, { recursive: true });
    return fs
      .readdirSync(themesDir)
      .filter((name) => name.endsWith('.json'))
      .slice(0, 100)
      .map((name) => {
        const file = path.join(themesDir, name);
        try {
          const stat = fs.statSync(file);
          if (stat.size > 200 * 1024) return null;
          return normalizeTheme(readJson(file, null), name.replace(/\.json$/, ''));
        } catch (error) {
          console.warn(`[themes] ${name}: ${error.message}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveTheme(rawTheme) {
  const theme = normalizeTheme(rawTheme, typeof rawTheme?.id === 'string' ? rawTheme.id : '');
  if (theme.id.startsWith('obsidian') || theme.id.startsWith('builtin-')) {
    throw new Error('Этот id зарезервирован для встроенной темы');
  }
  const { themesDir } = getPaths();
  fs.mkdirSync(themesDir, { recursive: true });
  const file = path.join(themesDir, `${theme.id}.json`);
  writeJsonAtomic(file, {
    id: theme.id,
    name: theme.name,
    mode: theme.mode,
    credit: theme.credit,
    tokens: theme.tokens,
    css: theme.css,
  });
  return theme;
}

function deleteTheme(id) {
  if (!ID_RE.test(String(id))) throw new Error('Некорректный id темы');
  const { themesDir } = getPaths();
  fs.rmSync(path.join(themesDir, `${id}.json`), { force: true });
  return listThemes();
}

module.exports = { listThemes, saveTheme, deleteTheme, normalizeTheme };
