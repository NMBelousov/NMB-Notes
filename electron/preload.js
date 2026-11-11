'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const menuListeners = new Set();
const closeListeners = new Set();
const streamListeners = new Map();

ipcRenderer.on('menu:action', (_event, payload) => {
  for (const listener of menuListeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error(error);
    }
  }
});

ipcRenderer.on('app:before-close', () => {
  for (const listener of closeListeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
});

ipcRenderer.on('ai:event', (_event, payload) => {
  const listener = streamListeners.get(payload?.id);
  if (!listener) return;
  try {
    listener(payload);
  } catch (error) {
    console.error(error);
  }
  if (payload.type === 'done' || payload.type === 'error') {
    streamListeners.delete(payload.id);
  }
});

function makeRequestId() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

contextBridge.exposeInMainWorld('api', {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    openFolder: (key) => ipcRenderer.invoke('app:open-folder', key),
    copyText: (text) => ipcRenderer.invoke('app:copy-text', text),
    reloadConfig: () => ipcRenderer.invoke('app:reload-config'),
    closeReady: () => ipcRenderer.invoke('app:close-ready'),
    onMenuAction: (callback) => {
      menuListeners.add(callback);
      return () => menuListeners.delete(callback);
    },
    onBeforeClose: (callback) => {
      closeListeners.add(callback);
      return () => closeListeners.delete(callback);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },
  vault: {
    get: () => ipcRenderer.invoke('vault:get'),
    saveNote: (note) => ipcRenderer.invoke('vault:save-note', note),
    createNote: (payload) => ipcRenderer.invoke('vault:create-note', payload),
    deleteNote: (id, permanent = false) =>
      ipcRenderer.invoke('vault:delete-note', { id, permanent }),
    restoreNote: (id) => ipcRenderer.invoke('vault:restore-note', id),
    emptyTrash: () => ipcRenderer.invoke('vault:empty-trash'),
    duplicateNote: (id) => ipcRenderer.invoke('vault:duplicate-note', id),
    setActive: (id) => ipcRenderer.invoke('vault:set-active', id),
    createFolder: (name) => ipcRenderer.invoke('vault:create-folder', name),
    renameFolder: (id, name) => ipcRenderer.invoke('vault:rename-folder', { id, name }),
    deleteFolder: (id) => ipcRenderer.invoke('vault:delete-folder', id),
    importMarkdown: () => ipcRenderer.invoke('vault:import-markdown'),
    exportJson: () => ipcRenderer.invoke('vault:export-json'),
    importJson: () => ipcRenderer.invoke('vault:import-json'),
    backup: () => ipcRenderer.invoke('vault:backup'),
    stats: () => ipcRenderer.invoke('vault:stats'),
  },
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    save: (theme) => ipcRenderer.invoke('themes:save', theme),
    delete: (id) => ipcRenderer.invoke('themes:delete', id),
  },
  widgets: {
    list: () => ipcRenderer.invoke('widgets:list'),
    save: (payload) => ipcRenderer.invoke('widgets:save', payload),
    delete: (id) => ipcRenderer.invoke('widgets:delete', id),
    template: () => ipcRenderer.invoke('widgets:template'),
  },
  ai: {
    keyStatus: () => ipcRenderer.invoke('ai:key-status'),
    setKey: (key) => ipcRenderer.invoke('ai:set-key', key),
    clearKey: () => ipcRenderer.invoke('ai:clear-key'),
    test: () => ipcRenderer.invoke('ai:test'),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
    stream: (payload, onEvent) => {
      const id = makeRequestId();
      streamListeners.set(id, onEvent);
      ipcRenderer
        .invoke('ai:stream-start', { ...payload, id })
        .catch((error) => {
          onEvent({ id, type: 'error', message: String(error?.message || error) });
          streamListeners.delete(id);
        });
      return {
        id,
        cancel: () => {
          streamListeners.delete(id);
          ipcRenderer.invoke('ai:stream-cancel', id).catch(() => {});
        },
      };
    },
  },
  export: {
    markdown: (payload) => ipcRenderer.invoke('export:markdown', payload),
    pdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  },
});
