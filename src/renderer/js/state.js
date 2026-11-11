import { THEMES } from '../themes/index.js';
import { extractTags } from './markdown.js';

const api = window.api;

export const state = {
  ready: false,
  info: null,
  settings: null,
  vault: { version: 1, folders: [], notes: [], activeNoteId: null },
  userThemes: [],
  themes: THEMES.slice(),
  userWidgets: [],
  widgetErrors: [],
  aiKeyStatus: { set: false, hint: '', method: 'none', backend: '—', cipher: '—' },
  githubStatus: { set: false, hint: '', method: 'none', backend: '—', cipher: '—' },
  updateInfo: null,
  updateError: null,
  view: { type: 'all', folderId: null },
  search: '',
  saveState: 'saved',
  rightTab: 'preview',
  aiOpen: false,
  settingsTab: 'appearance',
  compactSidebar: false,
  userThemesLoaded: false,
};

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  for (const handler of listeners.get(event) || []) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[event:${event}]`, error);
    }
  }
  for (const handler of listeners.get('*') || []) {
    try {
      handler(event, payload);
    } catch (error) {
      console.error('[event:*]', error);
    }
  }
}

export function activeNote() {
  return (
    state.vault.notes.find((note) => note.id === state.vault.activeNoteId) || null
  );
}

export function noteById(id) {
  return state.vault.notes.find((note) => note.id === id) || null;
}

export function folderById(id) {
  return state.vault.folders.find((folder) => folder.id === id) || null;
}

export function isDeletedView() {
  return state.view.type === 'trash';
}

export function visibleNotes() {
  const { notes } = state.vault;
  let result = notes.filter((note) =>
    isDeletedView() ? Boolean(note.deletedAt) : !note.deletedAt
  );
  if (state.view.type === 'favorites') {
    result = result.filter((note) => note.favorite);
  } else if (state.view.type === 'folder') {
    result = result.filter((note) => note.folderId === state.view.folderId);
  }
  const query = state.search.trim().toLowerCase();
  if (query) {
    const plain = query.replace(/^#/, '');
    result = result.filter((note) => {
      if (note.title.toLowerCase().includes(plain)) return true;
      if (note.body.toLowerCase().includes(plain)) return true;
      return extractTags(note.body).some((tag) =>
        tag.toLowerCase().includes(plain)
      );
    });
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function sidebarTags() {
  const counts = new Map();
  for (const note of state.vault.notes) {
    if (note.deletedAt) continue;
    for (const tag of extractTags(note.body)) {
      if (/^\d+$/.test(tag)) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 16);
}

export function viewTitle() {
  if (state.view.type === 'favorites') return 'Избранное';
  if (state.view.type === 'trash') return 'Корзина';
  if (state.view.type === 'folder') {
    return folderById(state.view.folderId)?.name || 'Папка';
  }
  return 'Все заметки';
}

export function applyVault(vault, { silent = false } = {}) {
  if (!vault) return;
  state.vault = vault;
  if (state.view.type === 'folder' && !folderById(state.view.folderId)) {
    state.view = { type: 'all', folderId: null };
    emit('view:changed');
  }
  if (!state.vault.notes.some((note) => note.id === state.vault.activeNoteId)) {
    const nonDeleted = state.vault.notes.filter((note) => !note.deletedAt);
    const candidate =
      state.view.type === 'trash'
        ? state.vault.notes.find((note) => note.deletedAt)
        : nonDeleted[0];
    state.vault.activeNoteId = candidate?.id || null;
  }
  if (!silent) {
    emit('vault:changed');
    emit('note:selected', activeNote());
  }
}

export async function initState() {
  const [vault, settings, info, userThemes, aiKeyStatus, githubStatus] =
    await Promise.all([
      api.vault.get(),
      api.settings.get(),
      api.app.info(),
      api.themes.list(),
      api.ai.keyStatus(),
      api.updates.tokenStatus(),
    ]);
  state.vault = vault;
  state.settings = settings;
  state.info = info;
  state.userThemes = userThemes || [];
  state.themes = [...THEMES, ...state.userThemes];
  state.aiKeyStatus = aiKeyStatus;
  state.githubStatus = githubStatus;
  state.view = { type: 'all', folderId: null };
  state.rightTab = settings.layout.rightTab === 'widgets' ? 'widgets' : 'preview';

  if (!state.vault.notes.length) {
    const created = await api.vault.createNote({
      title: 'Моя первая заметка',
      body: '# Моя первая заметка\n\nНачните писать здесь. Нажмите / в начале строки, чтобы открыть меню блоков.\n',
    });
    state.vault = created.vault;
  }
  if (!state.vault.notes.some((note) => note.id === state.vault.activeNoteId)) {
    state.vault.activeNoteId =
      state.vault.notes.find((note) => !note.deletedAt)?.id ||
      state.vault.notes[0]?.id ||
      null;
  }
  state.ready = true;
}

export async function selectNote(id) {
  if (!id || state.vault.activeNoteId === id) return;
  const note = noteById(id);
  if (!note) return;
  await flushNotes();
  state.vault.activeNoteId = id;
  emit('note:selected', note);
  api.vault.setActive(id).catch(() => {});
}

export function setView(view) {
  state.view = view;
  state.search = '';
  const active = activeNote();
  const notes = state.vault.notes;
  if (view.type === 'trash') {
    if (!active?.deletedAt) {
      state.vault.activeNoteId = notes.find((note) => note.deletedAt)?.id || null;
      if (state.vault.activeNoteId) {
        api.vault.setActive(state.vault.activeNoteId).catch(() => {});
      }
    }
  } else if (!active || active.deletedAt) {
    state.vault.activeNoteId = notes.find((note) => !note.deletedAt)?.id || null;
    if (state.vault.activeNoteId) {
      api.vault.setActive(state.vault.activeNoteId).catch(() => {});
    }
  }
  emit('view:changed');
  emit('search:changed');
  emit('note:selected', activeNote());
}

export async function createNote(payload = {}) {
  await flushNotes();
  const folderId =
    payload.folderId !== undefined
      ? payload.folderId
      : state.view.type === 'folder'
        ? state.view.folderId
        : null;
  const created = await api.vault.createNote({
    title: payload.title || 'Новая заметка',
    body: payload.body || '',
    folderId,
  });
  state.vault = created.vault;
  state.vault.activeNoteId = created.note.id;
  if (
    state.view.type === 'trash' ||
    state.view.type === 'favorites' ||
    state.search.trim()
  ) {
    state.view = { type: 'all', folderId: null };
    state.search = '';
    emit('view:changed');
    emit('search:changed');
  }
  emit('vault:changed');
  emit('note:selected', activeNote());
  return created.note;
}

export async function deleteNote(id, permanent = false) {
  const result = await api.vault.deleteNote(id, permanent);
  applyVault(result);
  return result;
}

export async function restoreNote(id) {
  const result = await api.vault.restoreNote(id);
  applyVault(result);
  setView({ type: 'all', folderId: null });
}

export async function emptyTrash() {
  const result = await api.vault.emptyTrash();
  applyVault(result);
}

export async function duplicateNote(id) {
  const result = await api.vault.duplicateNote(id);
  applyVault(result);
  if (
    state.view.type === 'favorites' ||
    state.view.type === 'trash' ||
    state.search.trim()
  ) {
    setView({ type: 'all', folderId: null });
  }
}

export async function toggleFavorite(id = state.vault.activeNoteId) {
  const note = noteById(id);
  if (!note) return;
  note.favorite = !note.favorite;
  await api.vault.saveNote({ id: note.id, favorite: note.favorite });
  emit('note:changed', note);
  emit('vault:changed');
}

export async function moveNote(id, folderId) {
  const note = noteById(id);
  if (!note) return;
  note.folderId = folderId || null;
  await api.vault.saveNote({ id: note.id, folderId: note.folderId });
  emit('note:changed', note);
  emit('vault:changed');
}

export async function createFolder(name) {
  const { folder, vault } = await api.vault.createFolder(name);
  applyVault(vault, { silent: true });
  emit('vault:changed');
  return folder;
}

export async function renameFolder(id, name) {
  const result = await api.vault.renameFolder(id, name);
  applyVault(result, { silent: true });
  emit('vault:changed');
}

export async function deleteFolder(id) {
  const result = await api.vault.deleteFolder(id);
  applyVault(result, { silent: true });
  emit('vault:changed');
}

export async function updateSettings(patch) {
  const next = await api.settings.update(patch);
  state.settings = next;
  emit('settings:changed', next);
  return next;
}

export async function refreshThemes() {
  state.userThemes = await api.themes.list();
  state.themes = [...THEMES, ...state.userThemes];
  emit('themes:changed');
  return state.themes;
}

export async function refreshKeyStatus() {
  state.aiKeyStatus = await api.ai.keyStatus();
  emit('ai:key-changed', state.aiKeyStatus);
  return state.aiKeyStatus;
}

export async function refreshGithubStatus() {
  state.githubStatus = await api.updates.tokenStatus();
  emit('updates:token-changed', state.githubStatus);
  return state.githubStatus;
}

export function setSearch(query) {
  state.search = String(query || '');
  emit('search:changed');
}

/* ---------- Автосохранение ---------- */

let saveTimer = null;
let pendingSave = null;
let saveChain = Promise.resolve();

function setSaveState(value) {
  if (state.saveState === value) return;
  state.saveState = value;
  emit('save:state', value);
}

export function touchNote(patch, { immediate = false } = {}) {
  const note = activeNote();
  if (!note) return;
  Object.assign(note, patch);
  note.updatedAt = Date.now();
  emit('note:changed', note);
  scheduleSave(note, immediate);
}

function scheduleSave(note, immediate) {
  clearTimeout(saveTimer);
  const payload = {
    id: note.id,
    title: note.title,
    body: note.body,
    folderId: note.folderId,
    favorite: note.favorite,
  };
  const run = async () => {
    pendingSave = null;
    setSaveState('saving');
    saveChain = saveChain
      .catch(() => {})
      .then(async () => {
        try {
          const updated = await api.vault.saveNote(payload);
          if (updated) {
            const current = noteById(updated.id);
            if (current) {
              current.updatedAt = updated.updatedAt;
            }
          }
          setSaveState('saved');
          emit('note:meta', noteById(payload.id));
        } catch (error) {
          console.error('[save]', error);
          setSaveState('error');
          emit('save:error', error);
        }
      });
    return saveChain;
  };
  pendingSave = run;
  if (immediate) return run();
  const delay = state.settings?.editor?.autoSaveMs || 400;
  saveTimer = setTimeout(run, delay);
  return Promise.resolve();
}

export async function flushNotes() {
  clearTimeout(saveTimer);
  if (pendingSave) {
    const fn = pendingSave;
    pendingSave = null;
    await fn();
  }
  await saveChain.catch(() => {});
}

export function markSaved() {
  setSaveState('saved');
  emit('save:state', 'saved');
}

export async function exportNoteMarkdown(note = activeNote()) {
  if (!note) return null;
  return api.export.markdown({ title: note.title, body: note.body });
}

export async function exportNotePdf(html, note = activeNote()) {
  if (!note) return null;
  return api.export.pdf({ title: note.title, html });
}

export function viewFolderId() {
  return state.view.type === 'folder' ? state.view.folderId : null;
}
