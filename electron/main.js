'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  clipboard,
  session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { getPaths, ensureDirs } = require('./lib/paths');
const { getConfig, configSummary } = require('./lib/config');
const settingsLib = require('./lib/settings');
const notesLib = require('./lib/notes');
const themesLib = require('./lib/themes');
const widgetsLib = require('./lib/widgets');
const secrets = require('./lib/secrets');
const ai = require('./lib/ai');
const exporter = require('./lib/exporter');
const updates = require('./lib/updates');
const { installMenu } = require('./lib/menu');

app.setName('NMB Notes');
if (process.platform === 'win32') app.setAppUserModelId('com.nmb.notes');

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let allowClose = false;
let quitRequested = false;
let waitingFlush = false;
const streamControllers = new Map();

function trusted(event) {
  try {
    const url = event.sender.getURL();
    return url.startsWith('file://');
  } catch {
    return false;
  }
}

function assertTrusted(event) {
  if (!trusted(event)) throw new Error('Недоверенный источник запроса');
}

function registerIpc() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrusted(event);
      return fn(event, ...args);
    });
  };

  handle('app:info', () => {
    const p = getPaths();
    return {
      name: 'NMB Notes',
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
      paths: {
        userData: p.root,
        config: p.configFile,
        themes: p.themesDir,
        widgets: p.widgetsDir,
        backups: p.backupsDir,
      },
      config: configSummary(),
    };
  });

  handle('app:open-external', (_event, url) => {
    if (typeof url !== 'string' || url.length > 2000) return false;
    if (!/^(https?:|mailto:)/i.test(url)) return false;
    shell.openExternal(url).catch(() => {});
    return true;
  });

  handle('app:open-folder', (_event, key) => {
    const p = getPaths();
    const map = {
      userData: p.root,
      config: p.configDir,
      themes: p.themesDir,
      widgets: p.widgetsDir,
      backups: p.backupsDir,
    };
    const target = map[String(key)];
    if (!target) return false;
    fs.mkdirSync(target, { recursive: true });
    shell.openPath(target).catch(() => {});
    return true;
  });

  handle('app:copy-text', (_event, text) => {
    if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) return false;
    clipboard.writeText(text);
    return true;
  });

  handle('app:reload-config', () => {
    getConfig({ reload: true });
    return configSummary();
  });

  handle('app:close-ready', () => {
    finishClose();
    return true;
  });

  handle('settings:get', () => settingsLib.getSettings());
  handle('settings:update', (_event, patch) => settingsLib.updateSettings(patch));
  handle('settings:reset', () => settingsLib.resetSettings());

  handle('vault:get', () => notesLib.snapshot());
  handle('vault:save-note', (_event, note) => notesLib.saveNote(note));
  handle('vault:create-note', (_event, payload) => notesLib.createNote(payload || {}));
  handle('vault:delete-note', (_event, { id, permanent } = {}) =>
    notesLib.deleteNote(String(id || ''), permanent === true)
  );
  handle('vault:restore-note', (_event, id) => notesLib.restoreNote(String(id || '')));
  handle('vault:empty-trash', () => notesLib.emptyTrash());
  handle('vault:duplicate-note', (_event, id) => notesLib.duplicateNote(String(id || '')));
  handle('vault:set-active', (_event, id) => notesLib.setActiveNote(String(id || '')));
  handle('vault:create-folder', (_event, name) => notesLib.createFolder(String(name || '')));
  handle('vault:rename-folder', (_event, { id, name } = {}) =>
    notesLib.renameFolder(String(id || ''), String(name || ''))
  );
  handle('vault:delete-folder', (_event, id) => notesLib.deleteFolder(String(id || '')));
  handle('vault:import-markdown', () => notesLib.importMarkdown());
  handle('vault:export-json', () => notesLib.exportVaultJson());
  handle('vault:import-json', () => notesLib.importVaultJson());
  handle('vault:backup', () => notesLib.backupNow());
  handle('vault:stats', () => notesLib.vaultStats());

  handle('themes:list', () => themesLib.listThemes());
  handle('themes:save', (_event, theme) => themesLib.saveTheme(theme));
  handle('themes:delete', (_event, id) => themesLib.deleteTheme(id));

  handle('widgets:list', () => widgetsLib.listWidgets());
  handle('widgets:save', (_event, payload) => widgetsLib.saveWidget(payload || {}));
  handle('widgets:delete', (_event, id) => widgetsLib.deleteWidget(id));
  handle('widgets:template', () => widgetsLib.exportWidgetTemplate());

  handle('ai:key-status', () => secrets.keyStatus());
  handle('ai:set-key', (_event, key) => secrets.setApiKey(String(key || '')));
  handle('ai:clear-key', () => secrets.clearApiKey());
  handle('ai:test', () => ai.testConnection());
  handle('ai:chat', (_event, payload) => ai.chat(payload || {}));

  handle('ai:stream-start', (event, payload = {}) => {
    const id = String(payload.id || '').slice(0, 120);
    if (!id) throw new Error('Некорректный id запроса');
    const controller = new AbortController();
    const mapKey = `${event.sender.id}:${id}`;
    streamControllers.get(mapKey)?.abort();
    streamControllers.set(mapKey, controller);
    const send = (data) => {
      if (event.sender.isDestroyed()) return;
      event.sender.send('ai:event', { id, ...data });
    };
    (async () => {
      try {
        const result = await ai.streamChat(payload, controller.signal, send);
        send({
          type: 'done',
          text: result.text,
          reasoning: result.reasoning,
          usage: result.usage,
        });
      } catch (error) {
        const message =
          controller.signal.aborted && error.message !== 'Генерация остановлена'
            ? 'Генерация остановлена'
            : error.message || 'Ошибка AI';
        send({ type: 'error', message });
      } finally {
        streamControllers.delete(mapKey);
      }
    })();
    return { ok: true, id };
  });

  handle('ai:stream-cancel', (event, id) => {
    const mapKey = `${event.sender.id}:${String(id || '')}`;
    const controller = streamControllers.get(mapKey);
    if (controller) {
      controller.abort();
      streamControllers.delete(mapKey);
      return true;
    }
    return false;
  });

  handle('updates:check', () => updates.checkForUpdates());
  handle('updates:download', (event) => updates.downloadUpdate(event.sender));
  handle('updates:install', () => updates.installUpdate());
  handle('updates:token-status', () => secrets.githubStatus());
  handle('updates:set-token', (_event, token) => secrets.setGithubToken(String(token || '')));
  handle('updates:clear-token', () => secrets.clearGithubToken());

  handle('export:markdown', (_event, payload) => exporter.exportMarkdown(payload || {}));
  handle('export:pdf', (_event, payload) => {
    if (typeof payload?.html !== 'string' || payload.html.length > 25 * 1024 * 1024) {
      throw new Error('Слишком большой документ для экспорта');
    }
    return exporter.exportPdf(payload);
  });
}

function createWindow() {
  const config = getConfig();
  const paths = ensureDirs();
  allowClose = false;
  quitRequested = false;
  waitingFlush = false;
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'NMB Notes',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: paths.preloadFile,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const wcId = mainWindow.webContents.id;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    requestClose(false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('destroyed', () => {
    for (const [key, controller] of streamControllers) {
      if (key.startsWith(`${wcId}:`)) controller.abort();
    }
  });

  installMenu(mainWindow, { isDev, config });
  mainWindow.loadFile(path.join(paths.rendererDir, 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function requestClose(quit) {
  const win = mainWindow;
  if (!win) {
    allowClose = true;
    app.quit();
    return;
  }
  quitRequested = quitRequested || quit;
  if (allowClose) {
    finishClose();
    return;
  }
  if (waitingFlush) return;
  waitingFlush = true;
  try {
    win.webContents.send('app:before-close');
  } catch {
    finishClose();
    return;
  }
  setTimeout(() => finishClose(), 1800);
}

function finishClose() {
  allowClose = true;
  waitingFlush = false;
  const finalize = () => {
    if (quitRequested) {
      app.quit();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  };
  Promise.allSettled([settingsLib.flushSettings(), notesLib.flushVault()]).finally(
    finalize
  );
}

app.on('before-quit', (event) => {
  if (allowClose) return;
  event.preventDefault();
  requestClose(true);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  ensureDirs();
  getConfig();
  settingsLib.getSettings();
  notesLib.getVault();
  registerIpc();

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('[main] uncaughtException:', error);
});
process.on('unhandledRejection', (error) => {
  console.error('[main] unhandledRejection:', error);
});

process.on('exit', () => {
  for (const controller of streamControllers.values()) controller.abort();
});

module.exports = {};
