'use strict';

const fs = require('node:fs');
const { getPaths } = require('./paths');
const { readJson, isPlainObject, cleanString } = require('./util');

const DEFAULT_CONFIG = {
  window: {
    width: 1440,
    height: 920,
    minWidth: 940,
    minHeight: 600,
  },
  // Defaults applied only for fresh profiles or keys the user hasn't changed yet.
  defaults: {},
  security: {
    allowExternalLinks: true,
  },
  devTools: false,
};

let cached = null;

function sanitizeConfig(raw) {
  if (!isPlainObject(raw)) return { ...DEFAULT_CONFIG };
  const window = isPlainObject(raw.window) ? raw.window : {};
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    window: {
      width: Math.min(3840, Math.max(940, Number(window.width) || DEFAULT_CONFIG.window.width)),
      height: Math.min(2160, Math.max(600, Number(window.height) || DEFAULT_CONFIG.window.height)),
      minWidth: Math.min(1920, Math.max(720, Number(window.minWidth) || DEFAULT_CONFIG.window.minWidth)),
      minHeight: Math.min(1440, Math.max(480, Number(window.minHeight) || DEFAULT_CONFIG.window.minHeight)),
    },
    defaults: isPlainObject(raw.defaults) ? raw.defaults : {},
    security: {
      allowExternalLinks:
        raw.security?.allowExternalLinks !== false,
    },
    devTools: raw.devTools === true,
  };
}

function getConfig({ reload = false } = {}) {
  if (cached && !reload) return cached;
  const { configFile, configDir } = getPaths();
  if (!fs.existsSync(configFile)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        configFile,
        JSON.stringify(
          {
            window: DEFAULT_CONFIG.window,
            defaults: {
              theme: 'obsidian-dark',
            },
            security: { allowExternalLinks: true },
            devTools: false,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
    } catch {
      /* ignore */
    }
  }
  cached = sanitizeConfig(readJson(configFile, {}));
  return cached;
}

function configSummary() {
  const { configFile } = getPaths();
  return {
    path: configFile,
    window: getConfig().window,
    devTools: getConfig().devTools,
    allowExternalLinks: getConfig().security.allowExternalLinks,
    defaults: getConfig().defaults,
  };
}

function describeUserAgent(ua) {
  return cleanString(ua, 200);
}

module.exports = { getConfig, configSummary, DEFAULT_CONFIG, describeUserAgent };
