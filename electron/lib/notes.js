'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { getPaths } = require('./paths');
const {
  readJson,
  writeJsonAtomic,
  cleanString,
  safeFileName,
  uuid,
  backupRotation,
} = require('./util');
const { getSettings } = require('./settings');

const MAX_BODY = 5 * 1024 * 1024;

function seedVault() {
  const now = Date.now();
  const folderId = 'folder-start';
  return {
    version: 1,
    folders: [{ id: folderId, name: 'Быстрый старт', createdAt: now }],
    notes: [
      {
        id: 'note-welcome',
        title: 'Добро пожаловать в NMB Notes',
        folderId,
        favorite: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        body: `# Добро пожаловать в NMB Notes

Локальный редактор заметок с **четырьмя колонками**, живым предпросмотром и AI-помощником на базе DeepSeek.

## Быстрый старт

- \`Ctrl/Cmd + N\` — новая заметка
- \`Ctrl/Cmd + K\` — поиск
- \`Ctrl/Cmd + E\` — AI-панель
- \`/\` в начале строки — меню блоков
- \`[[Название заметки]]\` — ссылка на другую заметку

> Все заметки хранятся локально. Наружу уходят только запросы к DeepSeek, и только когда вы сами их отправляете.

## Виджеты

Виджеты можно встраивать прямо в заметку:

::widget[stats]

Откройте вкладку **Виджеты** справа или настройки → «Виджеты», чтобы включить остальные.`,
      },
      {
        id: 'note-editor',
        title: 'Редактор и slash-меню',
        folderId: null,
        favorite: false,
        createdAt: now - 1000,
        updatedAt: now - 1000,
        deletedAt: null,
        body: `# Редактор и slash-меню

Нажмите \`/\` в начале пустой строки — появится меню блоков.

## Что поддерживается

| Блок | Синтаксис |
| --- | --- |
| Заголовок | \`# H1\` … \`###### H6\` |
| Список | \`- пункт\` |
| Чек-лист | \`- [ ] задача\` |
| Цитата | \`> текст\` |
| Код | \`\`\`js … \`\`\` |
| Таблица | \`| A | B |\` |
| Разделитель | \`---\` |
| Виджет | \`::widget[stats]\` |

## Чек-лист

- [x] Открыть приложение
- [x] Написать первую заметку
- [ ] Настроить AI-ключ
- [ ] Создать свой виджет

## Горячие клавиши

- \`Ctrl/Cmd + N\` — новая заметка
- \`Ctrl/Cmd + K\` — поиск
- \`Ctrl/Cmd + S\` — сохранить сейчас
- \`Ctrl/Cmd + E\` — AI-панель
- \`Ctrl/Cmd + ,\` — настройки
- \`Ctrl/Cmd + Shift + P\` — вкладка «Предпросмотр»
- \`Ctrl/Cmd + Shift + W\` — вкладка «Виджеты»`,
      },
      {
        id: 'note-ai',
        title: 'AI-помощник и безопасность',
        folderId: null,
        favorite: false,
        createdAt: now - 2000,
        updatedAt: now - 2000,
        deletedAt: null,
        body: `# AI-помощник и безопасность

AI работает через DeepSeek API. Ключ добавляется в **Настройки → AI**.

## Как хранится ключ

- На macOS и Windows — в системном хранилище (Keychain / DPAPI) через Electron \`safeStorage\`.
- На Linux — через системный keyring, а если он недоступен, ключ шифруется AES-256-GCM локальным ключом с правами \`600\`.
- Ключ никогда не попадает в renderer, логи или файлы заметок.

## Что отправляется в API

Только ваши сообщения и — если включён переключатель «Контекст заметки» — текст текущей заметки. Отключите контекст, если не хотите отправлять заметку.

## Полезные запросы

- «Составь план на неделю по этой заметке»
- «Сократи текст, сохрани смысл»
- «Преврати это в чек-лист»
- «Продолжи абзац в том же стиле»

Откройте панель AI кнопкой справа или сочетанием \`Ctrl/Cmd + E\`.`,
      },
      {
        id: 'note-links',
        title: 'Полезные ссылки',
        folderId: null,
        favorite: false,
        createdAt: now - 3000,
        updatedAt: now - 3000,
        deletedAt: null,
        body: `# Полезные ссылки

- [DeepSeek Platform](https://platform.deepseek.com) — API-ключи и баланс
- [Markdown Guide](https://www.markdownguide.org) — шпаргалка по Markdown
- [Obsidian](https://obsidian.md) — источник вдохновения и тем

## Идеи для заметок

- [ ] Создать виджет «Календарь»
- [ ] Добавить свою тему
- [ ] Настроить ежедневный бэкап`,
      },
    ],
    activeNoteId: 'note-welcome',
  };
}

function sanitizeNote(rawNote) {
  if (!rawNote || typeof rawNote !== 'object') return null;
  const id = typeof rawNote.id === 'string' && rawNote.id ? rawNote.id : uuid();
  const title = cleanString(rawNote.title, 200, 'Без названия').trim() || 'Без названия';
  const body = cleanString(rawNote.body, MAX_BODY, '');
  return {
    id,
    title,
    body,
    folderId: typeof rawNote.folderId === 'string' ? rawNote.folderId : null,
    favorite: rawNote.favorite === true,
    createdAt: Number(rawNote.createdAt) || Date.now(),
    updatedAt: Number(rawNote.updatedAt) || Date.now(),
    deletedAt: Number(rawNote.deletedAt) || null,
  };
}

function sanitizeVault(raw) {
  const seed = seedVault();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) {
    return seed;
  }
  const folders = Array.isArray(raw.folders)
    ? raw.folders
        .filter((f) => f && typeof f.name === 'string')
        .map((f) => ({
          id: typeof f.id === 'string' && f.id ? f.id : uuid(),
          name: cleanString(f.name, 80, 'Папка').trim() || 'Папка',
          createdAt: Number(f.createdAt) || Date.now(),
        }))
        .slice(0, 200)
    : [];
  const folderIds = new Set(folders.map((f) => f.id));
  const seen = new Set();
  const notes = raw.notes
    .map(sanitizeNote)
    .filter(Boolean)
    .filter((note) => (seen.has(note.id) ? false : seen.add(note.id)))
    .map((note) => ({
      ...note,
      folderId: note.folderId && folderIds.has(note.folderId) ? note.folderId : null,
    }))
    .slice(0, 10000);
  const activeNoteId =
    typeof raw.activeNoteId === 'string' && notes.some((n) => n.id === raw.activeNoteId)
      ? raw.activeNoteId
      : notes.find((n) => !n.deletedAt)?.id || null;
  return { version: 1, folders, notes, activeNoteId };
}

let vault = null;
let writePromise = Promise.resolve();
let lastBackupDay = null;

function loadVault() {
  if (vault) return vault;
  const { vaultFile } = getPaths();
  const raw = readJson(vaultFile, null);
  vault = sanitizeVault(raw);
  if (!raw) {
    writeJsonAtomic(vaultFile, vault);
  }
  maybeDailyBackup();
  return vault;
}

function getVault() {
  return loadVault();
}

function snapshot() {
  const v = getVault();
  return {
    version: 1,
    folders: v.folders.map((f) => ({ ...f })),
    notes: v.notes.map((n) => ({ ...n })),
    activeNoteId: v.activeNoteId,
  };
}

function persist() {
  const { vaultFile } = getPaths();
  const data = snapshot();
  writePromise = writePromise
    .then(() => writeJsonAtomic(vaultFile, data))
    .catch((error) => console.error('[vault] save failed:', error.message));
  return writePromise;
}

function maybeDailyBackup() {
  try {
    const { backupsDir } = getPaths();
    fs.mkdirSync(backupsDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    if (lastBackupDay === day) return;
    const file = path.join(backupsDir, `backup-${day}.json`);
    if (!fs.existsSync(file)) {
      writeJsonAtomic(file, {
        app: 'NMB Notes',
        createdAt: new Date().toISOString(),
        vault: snapshot(),
        settings: getSettings(),
      });
      backupRotation(backupsDir, 10);
    }
    lastBackupDay = day;
  } catch {
    /* non-critical */
  }
}

async function saveNote(patch) {
  const v = getVault();
  if (!patch || typeof patch.id !== 'string') return null;
  const note = v.notes.find((n) => n.id === patch.id);
  if (!note) return null;
  if (typeof patch.title === 'string') {
    note.title = cleanString(patch.title, 200, 'Без названия').trim() || 'Без названия';
  }
  if (typeof patch.body === 'string') {
    note.body = patch.body.slice(0, MAX_BODY);
  }
  if ('folderId' in patch) {
    const exists = v.folders.some((f) => f.id === patch.folderId);
    note.folderId = exists ? patch.folderId : null;
  }
  if ('favorite' in patch) note.favorite = patch.favorite === true;
  if ('deletedAt' in patch) {
    note.deletedAt = Number(patch.deletedAt) || null;
  }
  note.updatedAt = Date.now();
  await persist();
  return { ...note };
}

async function createNote({ folderId = null, title = 'Новая заметка', body = '' } = {}) {
  const v = getVault();
  const now = Date.now();
  const cleanTitle = cleanString(title, 200, 'Новая заметка').trim() || 'Новая заметка';
  const note = {
    id: uuid(),
    title: cleanTitle,
    body: typeof body === 'string' && body ? body.slice(0, MAX_BODY) : `# ${cleanTitle}\n\n`,
    folderId: v.folders.some((f) => f.id === folderId) ? folderId : null,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  v.notes.unshift(note);
  v.activeNoteId = note.id;
  await persist();
  return { note: { ...note }, vault: snapshot() };
}

async function setActiveNote(id) {
  const v = getVault();
  if (v.notes.some((n) => n.id === id)) {
    v.activeNoteId = id;
    await persist();
  }
  return snapshot();
}

async function deleteNote(id, permanent = false) {
  const v = getVault();
  const index = v.notes.findIndex((n) => n.id === id);
  if (index === -1) return snapshot();
  if (permanent || !v.notes[index].deletedAt) {
    if (permanent) {
      v.notes.splice(index, 1);
    } else {
      v.notes[index].deletedAt = Date.now();
      v.notes[index].favorite = false;
    }
  }
  if (v.activeNoteId === id) {
    v.activeNoteId = v.notes.find((n) => !n.deletedAt)?.id || null;
  }
  await persist();
  return snapshot();
}

async function restoreNote(id) {
  const v = getVault();
  const note = v.notes.find((n) => n.id === id);
  if (note) {
    note.deletedAt = null;
    note.updatedAt = Date.now();
    v.activeNoteId = note.id;
    await persist();
  }
  return snapshot();
}

async function emptyTrash() {
  const v = getVault();
  v.notes = v.notes.filter((n) => !n.deletedAt);
  if (!v.notes.some((n) => n.id === v.activeNoteId)) {
    v.activeNoteId = v.notes[0]?.id || null;
  }
  await persist();
  return snapshot();
}

async function duplicateNote(id) {
  const v = getVault();
  const src = v.notes.find((n) => n.id === id);
  if (!src) return snapshot();
  const now = Date.now();
  const copy = {
    ...src,
    id: uuid(),
    title: `${src.title} (копия)`.slice(0, 200),
    favorite: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  v.notes.unshift(copy);
  v.activeNoteId = copy.id;
  await persist();
  return snapshot();
}

async function createFolder(name) {
  const v = getVault();
  const clean = cleanString(name, 80, 'Новая папка').trim() || 'Новая папка';
  const folder = { id: uuid(), name: clean, createdAt: Date.now() };
  v.folders.push(folder);
  await persist();
  return { folder, vault: snapshot() };
}

async function renameFolder(id, name) {
  const v = getVault();
  const folder = v.folders.find((f) => f.id === id);
  if (folder) {
    folder.name = cleanString(name, 80, folder.name).trim() || folder.name;
    await persist();
  }
  return snapshot();
}

async function deleteFolder(id) {
  const v = getVault();
  v.folders = v.folders.filter((f) => f.id !== id);
  for (const note of v.notes) {
    if (note.folderId === id) note.folderId = null;
  }
  await persist();
  return snapshot();
}

function titleFromMarkdown(text, fileName) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 120);
  const base = fileName ? path.basename(fileName, path.extname(fileName)) : '';
  return base.slice(0, 120) || 'Импортированная заметка';
}

async function importMarkdown() {
  const win = require('electron').BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Импорт Markdown',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  });
  if (result.canceled || !result.filePaths.length) return { imported: 0, vault: snapshot() };
  const v = getVault();
  let imported = 0;
  let firstId = null;
  for (const file of result.filePaths.slice(0, 200)) {
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_BODY) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const note = {
        id: uuid(),
        title: titleFromMarkdown(raw, file),
        body: raw,
        folderId: null,
        favorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      };
      v.notes.unshift(note);
      imported += 1;
      firstId = firstId || note.id;
    } catch (error) {
      console.warn('[vault] import failed:', error.message);
    }
  }
  if (firstId) v.activeNoteId = firstId;
  await persist();
  return { imported, vault: snapshot() };
}

async function exportVaultJson() {
  const win = require('electron').BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(win, {
    title: 'Экспорт хранилища',
    defaultPath: `nmb-notes-vault-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  writeJsonAtomic(result.filePath, snapshot());
  return result.filePath;
}

async function importVaultJson() {
  const win = require('electron').BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Импорт хранилища',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const parsed = readJson(result.filePaths[0], null);
  if (!parsed || !Array.isArray(parsed.notes)) {
    throw new Error('Файл не похож на хранилище NMB Notes');
  }
  const incoming = sanitizeVault(parsed);
  const v = getVault();
  const folderIds = new Set(v.folders.map((f) => f.id));
  for (const folder of incoming.folders) {
    if (!folderIds.has(folder.id)) v.folders.push(folder);
  }
  const noteIds = new Set(v.notes.map((n) => n.id));
  let added = 0;
  for (const note of incoming.notes) {
    if (!noteIds.has(note.id)) {
      v.notes.push(note);
      added += 1;
    }
  }
  v.activeNoteId = v.notes.find((n) => !n.deletedAt)?.id || v.activeNoteId;
  await persist();
  return { added, vault: snapshot() };
}

async function backupNow() {
  const { backupsDir } = getPaths();
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupsDir, `backup-manual-${stamp}.json`);
  writeJsonAtomic(file, {
    app: 'NMB Notes',
    createdAt: new Date().toISOString(),
    vault: snapshot(),
    settings: getSettings(),
  });
  backupRotation(backupsDir, 20);
  return file;
}

async function flushVault() {
  await writePromise;
}

function vaultStats() {
  const v = getVault();
  const active = v.notes.filter((n) => !n.deletedAt);
  const words = active.reduce(
    (sum, n) => sum + (n.body.trim() ? n.body.trim().split(/\s+/).length : 0),
    0
  );
  return {
    notes: active.length,
    trash: v.notes.length - active.length,
    folders: v.folders.length,
    words,
  };
}

module.exports = {
  getVault,
  snapshot,
  saveNote,
  createNote,
  setActiveNote,
  deleteNote,
  restoreNote,
  emptyTrash,
  duplicateNote,
  createFolder,
  renameFolder,
  deleteFolder,
  importMarkdown,
  exportVaultJson,
  importVaultJson,
  backupNow,
  flushVault,
  vaultStats,
  sanitizeVault,
  safeFileName,
};
