import { THEMES, DEFAULT_THEME_ID } from '../themes/index.js';
import { state, emit } from './state.js';

const UI_FONTS = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
  mono: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", monospace',
};

const EDITOR_FONTS = {
  mono: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", monospace',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Arial, sans-serif',
};

const appliedVars = new Set();
let currentThemeId = null;

function camelToKebab(key) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setVar(name, value) {
  document.documentElement.style.setProperty(name, value);
  appliedVars.add(name);
}

function defaultTheme() {
  return THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) || THEMES[0];
}

export function resolveTheme(id) {
  const fromList = state.themes.find((theme) => theme.id === id);
  if (fromList) return fromList;
  const builtin = THEMES.find((theme) => theme.id === id);
  return builtin || defaultTheme();
}

function lightenHex(hex, amount = 0.12) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  const r = Math.min(255, Math.round(((num >> 16) & 255) * (1 + amount)));
  const g = Math.min(255, Math.round(((num >> 8) & 255) * (1 + amount)));
  const b = Math.min(255, Math.round((num & 255) * (1 + amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function applyThemeById(id, settings = state.settings) {
  const theme = resolveTheme(id);
  const base = defaultTheme();
  const tokens = { ...base.tokens, ...(theme.tokens || {}) };

  for (const name of appliedVars) {
    document.documentElement.style.removeProperty(name);
  }
  appliedVars.clear();

  for (const [key, value] of Object.entries(tokens)) {
    setVar(`--${camelToKebab(key)}`, String(value));
  }

  const accent = settings?.appearance?.accent;
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    setVar('--accent', accent);
    setVar('--accent-hover', lightenHex(accent, 0.12));
  }

  setVar('--font-ui', UI_FONTS[settings?.appearance?.uiFont] || UI_FONTS.system);
  setVar(
    '--editor-font',
    EDITOR_FONTS[settings?.appearance?.editorFont] || EDITOR_FONTS.mono
  );
  setVar('--editor-font-size', `${settings?.appearance?.editorFontSize || 14}px`);
  setVar('--editor-line-height', String(settings?.appearance?.lineHeight || 1.7));

  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.mode = theme.mode;
  document.documentElement.style.colorScheme = theme.mode === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('compact', settings?.appearance?.compact === true);

  let style = document.getElementById('nm-theme-extra');
  if (!style) {
    style = document.createElement('style');
    style.id = 'nm-theme-extra';
    document.head.appendChild(style);
  }
  style.textContent = [theme.css || '', settings?.appearance?.customCss || '']
    .filter(Boolean)
    .join('\n\n');

  currentThemeId = theme.id;
  emit('theme:applied', theme);
  return theme;
}

export function applyCurrentTheme() {
  if (!state.settings) return null;
  return applyThemeById(state.settings.theme, state.settings);
}

export function currentTheme() {
  return resolveTheme(currentThemeId || state.settings?.theme);
}

export function themeSwatch(theme) {
  const base = defaultTheme();
  const t = { ...base.tokens, ...(theme.tokens || {}) };
  return {
    bg: t.bg,
    sidebar: t.bgSidebar,
    panel: t.bgPanel,
    text: t.text,
    accent: t.accent,
    border: t.border,
  };
}

export function themeLabel(theme) {
  return theme.source === 'user' ? 'пользовательская' : theme.mode === 'light' ? 'светлая' : 'тёмная';
}
