'use strict';

const { getPaths } = require('./paths');
const { readJson, writeJsonAtomic, deepMerge, isPlainObject, clamp } = require('./util');
const { getConfig } = require('./config');

const DEFAULT_SETTINGS = {
  version: 1,
  theme: 'obsidian-dark',
  appearance: {
    uiFont: 'system',
    editorFont: 'mono',
    editorFontSize: 14,
    lineHeight: 1.7,
    accent: '',
    compact: false,
    customCss: '',
  },
  layout: {
    sidebar: true,
    sidebarWidth: 224,
    listWidth: 292,
    previewWidth: 390,
    listCollapsed: false,
    rightTab: 'preview',
  },
  editor: {
    livePreview: true,
    slashMenu: true,
    smartLists: true,
    spellcheck: true,
    autoSaveMs: 400,
  },
  ai: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    includeContext: true,
    stream: true,
  },
  widgets: {
    enabled: ['stats', 'outline', 'quick-actions', 'tags', 'related'],
  },
  updates: {
    repo: 'NMBelousov/NMB-Notes',
    channel: 'latest',
    apiBase: 'https://api.github.com',
    checkOnStartup: true,
  },
};

let current = null;
let writePromise = Promise.resolve();

function normalizeHttpUrl(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    if (url.protocol === 'http:' && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(trimmed)) {
      return fallback;
    }
    return trimmed.slice(0, 300);
  } catch {
    return fallback;
  }
}

function normalizeBaseUrl(value) {
  return normalizeHttpUrl(value, DEFAULT_SETTINGS.ai.baseUrl);
}

function normalizeRepo(value) {
  const fallback = DEFAULT_SETTINGS.updates.repo;
  if (typeof value !== 'string') return fallback;
  let trimmed = value.trim().slice(0, 200);
  // Репозиторий был переименован; старые настройки продолжают работать.
  if (trimmed.toLowerCase() === 'nmbelousov/nmb---note-s') trimmed = fallback;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeWidgetIds(list) {
  if (!Array.isArray(list)) return [...DEFAULT_SETTINGS.widgets.enabled];
  const seen = new Set();
  return list
    .filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-_]{0,48}$/i.test(id))
    .filter((id) => (seen.has(id) ? false : seen.add(id)))
    .slice(0, 100);
}

function sanitizeSettings(raw) {
  const base = deepMerge(
    JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    isPlainObject(getConfig().defaults) ? getConfig().defaults : {}
  );
  const merged = deepMerge(base, isPlainObject(raw) ? raw : {});
  const appearance = isPlainObject(merged.appearance) ? merged.appearance : {};
  const layout = isPlainObject(merged.layout) ? merged.layout : {};
  const editor = isPlainObject(merged.editor) ? merged.editor : {};
  const ai = isPlainObject(merged.ai) ? merged.ai : {};
  const widgets = isPlainObject(merged.widgets) ? merged.widgets : {};
  const updates = isPlainObject(merged.updates) ? merged.updates : {};

  return {
    version: 1,
    theme: typeof merged.theme === 'string' ? merged.theme.slice(0, 80) : 'obsidian-dark',
    appearance: {
      uiFont: ['system', 'serif', 'mono'].includes(appearance.uiFont)
        ? appearance.uiFont
        : 'system',
      editorFont: ['mono', 'serif', 'sans'].includes(appearance.editorFont)
        ? appearance.editorFont
        : 'mono',
      editorFontSize: clamp(appearance.editorFontSize, 11, 28, 14),
      lineHeight: clamp(appearance.lineHeight, 1.3, 2.4, 1.7),
      accent: /^#[0-9a-f]{6}$/i.test(appearance.accent || '') ? appearance.accent : '',
      compact: appearance.compact === true,
      customCss:
        typeof appearance.customCss === 'string'
          ? appearance.customCss.slice(0, 50000)
          : '',
    },
    layout: {
      sidebar: layout.sidebar !== false,
      sidebarWidth: clamp(layout.sidebarWidth, 176, 360, 224),
      listWidth: clamp(layout.listWidth, 230, 520, 292),
      previewWidth: clamp(layout.previewWidth, 280, 760, 390),
      listCollapsed: layout.listCollapsed === true,
      rightTab: ['preview', 'widgets'].includes(layout.rightTab)
        ? layout.rightTab
        : 'preview',
    },
    editor: {
      livePreview: editor.livePreview !== false,
      slashMenu: editor.slashMenu !== false,
      smartLists: editor.smartLists !== false,
      spellcheck: editor.spellcheck !== false,
      autoSaveMs: clamp(editor.autoSaveMs, 150, 3000, 400),
    },
    ai: {
      baseUrl: normalizeBaseUrl(ai.baseUrl),
      model:
        typeof ai.model === 'string' && ai.model.trim()
          ? ai.model.trim().slice(0, 100)
          : 'deepseek-chat',
      temperature: clamp(ai.temperature, 0, 2, 0.7),
      maxTokens: Math.round(clamp(ai.maxTokens, 64, 8192, 2048)),
      includeContext: ai.includeContext !== false,
      stream: ai.stream !== false,
    },
    widgets: {
      enabled: sanitizeWidgetIds(widgets.enabled),
    },
    updates: {
      repo: normalizeRepo(updates.repo),
      channel:
        typeof updates.channel === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(updates.channel)
          ? updates.channel
          : DEFAULT_SETTINGS.updates.channel,
      apiBase: normalizeHttpUrl(updates.apiBase, DEFAULT_SETTINGS.updates.apiBase),
      checkOnStartup: updates.checkOnStartup !== false,
    },
  };
}

function loadSettings() {
  if (current) return current;
  const { settingsFile } = getPaths();
  current = sanitizeSettings(readJson(settingsFile, {}));
  return current;
}

function getSettings() {
  return loadSettings();
}

function persist() {
  const { settingsFile } = getPaths();
  const snapshot = JSON.parse(JSON.stringify(current));
  writePromise = writePromise
    .then(() => writeJsonAtomic(settingsFile, snapshot))
    .catch((error) => console.error('[settings] save failed:', error.message));
  return writePromise;
}

async function updateSettings(patch) {
  if (!isPlainObject(patch)) return getSettings();
  const next = deepMerge(JSON.parse(JSON.stringify(getSettings())), patch);
  current = sanitizeSettings(next);
  await persist();
  return current;
}

async function resetSettings() {
  current = sanitizeSettings({});
  await persist();
  return current;
}

async function flushSettings() {
  await writePromise;
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  resetSettings,
  flushSettings,
  sanitizeSettings,
};
