'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function getPaths() {
  const root = app.getPath('userData');
  return {
    root,
    configDir: path.join(root, 'config'),
    configFile: path.join(root, 'config', 'app.json'),
    settingsFile: path.join(root, 'settings.json'),
    vaultFile: path.join(root, 'vault.json'),
    secretsFile: path.join(root, 'secrets.enc'),
    secretKeyFile: path.join(root, 'secrets.key'),
    themesDir: path.join(root, 'themes'),
    widgetsDir: path.join(root, 'widgets'),
    backupsDir: path.join(root, 'backups'),
    tmpDir: path.join(root, 'tmp'),
    rendererDir: path.join(__dirname, '..', '..', 'src', 'renderer'),
    docsDir: path.join(__dirname, '..', '..', 'docs'),
    preloadFile: path.join(__dirname, '..', 'preload.js'),
  };
}

function ensureDirs() {
  const p = getPaths();
  for (const dir of [
    p.root,
    p.configDir,
    p.themesDir,
    p.widgetsDir,
    p.backupsDir,
    p.tmpDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return p;
}

module.exports = { getPaths, ensureDirs };
