import { $, h, modKey } from './dom.js';
import { toast, notifyError } from './toast.js';
import { openModal, promptDialog } from './modal.js';
import { closeDropdown, isDropdownOpen } from './components/dropdown.js';
import { mountSidebar } from './components/sidebar.js';
import { mountNoteList } from './components/noteList.js';
import { mountTopbar } from './components/topbar.js';
import { mountEditor } from './components/editor.js';
import { mountRightPanel } from './components/rightPanel.js';
import { mountAiPanel } from './components/aiPanel.js';
import { mountStatusbar } from './components/statusbar.js';
import { mountSettings } from './components/settings/index.js';
import {
  registerBuiltinWidgets,
  loadUserWidgets,
} from './widgets/registry.js';
import {
  state,
  on,
  emit,
  initState,
  flushNotes,
  activeNote,
  createNote,
  createFolder,
  setView,
  setSearch,
  applyVault,
  duplicateNote,
  exportNoteMarkdown,
  updateSettings,
} from './state.js';
import { applyThemeById } from './theme.js';
import { buildPdfHtml } from './pdf.js';

const api = window.api;

function applyLayout(settings) {
  const root = document.documentElement;
  if (!settings) return;
  root.style.setProperty('--preview-w', `${settings.layout.previewWidth}px`);
  root.style.setProperty('--list-w', `${settings.layout.listWidth}px`);
  root.classList.toggle('compact', settings.appearance.compact === true);
}

async function exportPdfCurrent() {
  const note = activeNote();
  if (!note) {
    toast('Нет активной заметки', 'warn');
    return;
  }
  try {
    await flushNotes();
    const path = await api.export.pdf({
      title: note.title,
      html: buildPdfHtml(note),
    });
    if (path) toast('PDF сохранён');
  } catch (error) {
    notifyError(error);
  }
}

function focusSearch() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    document.getElementById('note-list')?.classList.add('open');
  }
  const input = document.querySelector('.search-box input');
  if (input) {
    input.focus();
    input.select();
  }
}

function showShortcuts() {
  const mod = modKey();
  const rows = [
    ['Новая заметка', `${mod} + N`],
    ['Новая папка', `${mod} + Shift + N`],
    ['Поиск заметок', `${mod} + K`],
    ['Найти (фокус в поиск)', `${mod} + F`],
    ['Сохранить сейчас', `${mod} + S`],
    ['AI-панель', `${mod} + E`],
    ['Настройки', `${mod} + ,`],
    ['Предпросмотр', `${mod} + Shift + Y`],
    ['Виджеты', `${mod} + Shift + W`],
    ['Дублировать заметку', `${mod} + Shift + D`],
    ['Экспорт в PDF', `${mod} + Shift + P`],
    ['Импорт Markdown', `${mod} + O`],
    ['Все заметки / Избранное', `${mod} + 1 / ${mod} + 2`],
    ['Slash-меню', '/ в начале строки'],
    ['Выйти из панели', 'Esc'],
  ];
  const grid = h(
    'div',
    { class: 'shortcut-grid' },
    ...rows.flatMap(([label, keys]) => [
      h('b', { text: label }),
      h('span', { style: { textAlign: 'right' } }, h('kbd', { text: keys })),
    ])
  );
  const modal = openModal({
    title: 'Горячие клавиши',
    body: grid,
    footer: h(
      'div',
      { class: 'modal-foot' },
      h('div', { class: 'spacer' }),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: () => modal.close(),
        },
        'Закрыть'
      )
    ),
  });
}

async function newFolderFlow() {
  const name = await promptDialog({
    title: 'Новая папка',
    label: 'Название папки',
    placeholder: 'Например, Работа',
    confirmLabel: 'Создать',
  });
  if (!name) return;
  try {
    const folder = await createFolder(name);
    setView({ type: 'folder', folderId: folder.id });
    toast(`Папка «${folder.name}» создана`);
  } catch (error) {
    notifyError(error);
  }
}

function setupSplitter() {
  const splitter = $('#preview-splitter');
  const root = document.documentElement;
  if (!splitter) return;
  let width = state.settings?.layout?.previewWidth || 390;
  splitter.addEventListener('pointerdown', (event) => {
    if (window.matchMedia('(max-width: 1120px)').matches) return;
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add('dragging');
    const onMove = (moveEvent) => {
      width = Math.round(
        Math.min(760, Math.max(280, window.innerWidth - moveEvent.clientX))
      );
      root.style.setProperty('--preview-w', `${width}px`);
    };
    const onUp = () => {
      splitter.removeEventListener('pointermove', onMove);
      splitter.removeEventListener('pointerup', onUp);
      splitter.removeEventListener('pointercancel', onUp);
      splitter.classList.remove('dragging');
      updateSettings({ layout: { previewWidth: width } }).catch(notifyError);
    };
    splitter.addEventListener('pointermove', onMove);
    splitter.addEventListener('pointerup', onUp);
    splitter.addEventListener('pointercancel', onUp);
  });
}

async function runCommand(action, payload = null) {
  try {
    switch (action) {
      case 'new-note': {
        await createNote();
        emit('editor:focus');
        break;
      }
      case 'new-folder':
        await newFolderFlow();
        break;
      case 'import-markdown': {
        const result = await api.vault.importMarkdown();
        if (result.imported) {
          applyVault(result.vault);
          if (state.view.type === 'favorites' || state.view.type === 'trash' || state.search) {
            setView({ type: 'all', folderId: null });
          }
          toast(`Импортировано файлов: ${result.imported}`);
        }
        break;
      }
      case 'export-markdown': {
        const path = await exportNoteMarkdown();
        if (path) toast('Markdown сохранён');
        break;
      }
      case 'export-pdf':
        await exportPdfCurrent();
        break;
      case 'duplicate-note': {
        const note = activeNote();
        if (note) {
          await duplicateNote(note.id);
          toast('Заметка продублирована');
        }
        break;
      }
      case 'settings':
        emit('ui:open-settings', payload || { tab: 'appearance' });
        break;
      case 'search':
        focusSearch();
        break;
      case 'view-all':
        setView({ type: 'all', folderId: null });
        break;
      case 'view-favorites':
        setView({ type: 'favorites' });
        break;
      case 'tab-preview':
        emit('ui:show-right-tab', { tab: 'preview' });
        break;
      case 'tab-widgets':
        emit('ui:show-right-tab', { tab: 'widgets' });
        break;
      case 'toggle-ai':
        emit('ai:toggle');
        break;
      case 'check-updates':
        emit('ui:open-settings', { tab: 'updates' });
        break;
      case 'docs-widgets':
        emit('ui:open-widget-guide');
        break;
      case 'shortcuts':
        showShortcuts();
        break;
      default:
        break;
    }
  } catch (error) {
    notifyError(error);
  }
}

function setupMenuActions() {
  api.app.onMenuAction(({ action, payload }) => {
    runCommand(action, payload);
  });
}

function setupGlobalKeys() {
  const isMac = state.info?.platform === 'darwin';
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (event.key === 'Escape') {
      if (document.querySelector('.modal-overlay')) return;
      if (isDropdownOpen()) {
        closeDropdown();
        return;
      }
      const settings = document.getElementById('settings-panel');
      if (settings?.classList.contains('open')) {
        emit('settings:close');
        return;
      }
      const ai = document.getElementById('ai-panel');
      if (ai?.classList.contains('open')) {
        emit('ai:close');
        return;
      }
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('note-list')?.classList.remove('open');
      document.getElementById('right-panel')?.classList.remove('open');
      return;
    }

    if (event.key === 'F1') {
      event.preventDefault();
      showShortcuts();
      return;
    }

    if (event.repeat) return;
    const mod = isMac ? event.metaKey : event.ctrlKey;
    if (!mod || event.altKey || (isMac && event.ctrlKey)) return;

    if (event.shiftKey && key === 'd') {
      event.preventDefault();
      runCommand('duplicate-note');
      return;
    }

    if (!event.shiftKey && key === 'f') {
      event.preventDefault();
      focusSearch();
      return;
    }

    // На macOS основные команды уже обслуживаются нативным меню.
    if (isMac) return;

    const shortcuts = {
      n: 'new-note',
      k: 'search',
      o: 'import-markdown',
      e: 'toggle-ai',
      ',': 'settings',
      '1': 'view-all',
      '2': 'view-favorites',
    };
    if (!event.shiftKey && shortcuts[key]) {
      event.preventDefault();
      runCommand(shortcuts[key]);
      return;
    }
    if (event.shiftKey) {
      const shiftShortcuts = {
        n: 'new-folder',
        e: 'export-markdown',
        p: 'export-pdf',
        y: 'tab-preview',
        w: 'tab-widgets',
      };
      if (shiftShortcuts[key]) {
        event.preventDefault();
        runCommand(shiftShortcuts[key]);
      }
    }
  });
}

function setupUpdateCheck() {
  if (state.settings?.updates?.checkOnStartup === false) return;
  setTimeout(async () => {
    try {
      const info = await api.updates.check();
      state.updateInfo = info;
      state.updateError = null;
      emit('updates:checked', info);
      if (info.available) {
        emit('updates:available', info);
        toast(
          `Доступно обновление NMB Notes ${info.latestVersion}. Настройки → Обновления`,
          'warn',
          7000
        );
      }
    } catch (error) {
      state.updateInfo = null;
      state.updateError = error?.message || String(error);
      emit('updates:checked', { error: state.updateError });
      console.info('[updates]', state.updateError);
    }
  }, 3000);
}

function setupEvents() {
  on('settings:changed', (settings) => {
    applyThemeById(settings.theme, settings);
    applyLayout(settings);
  });

  const updateTitle = () => {
    const note = activeNote();
    document.title = note ? `${note.title} — NMB Notes` : 'NMB Notes';
  };
  on('note:selected', updateTitle);
  on('note:meta', updateTitle);
  on('note:changed', updateTitle);

  on('ui:export-pdf', () => {
    exportPdfCurrent();
  });

  on('ui:search', ({ query }) => {
    setView({ type: 'all', folderId: null });
    setSearch(query);
    focusSearch();
  });

  on('ui:focus-search', focusSearch);

  on('settings:state', ({ open }) => {
    if (open) emit('ai:close');
  });

  setupMenuActions();
  setupGlobalKeys();
  setupSplitter();
  setupUpdateCheck();

  api.app.onBeforeClose(async () => {
    try {
      await flushNotes();
      await new Promise((resolve) => setTimeout(resolve, 80));
    } catch (error) {
      console.error(error);
    } finally {
      api.app.closeReady();
    }
  });

  window.addEventListener('blur', () => {
    flushNotes().catch(() => {});
  });
  window.addEventListener('beforeunload', () => {
    flushNotes().catch(() => {});
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1120) {
      document.getElementById('right-panel')?.classList.remove('open');
    }
    if (window.innerWidth > 900) {
      document.getElementById('sidebar')?.classList.remove('open');
    }
    if (window.innerWidth > 720) {
      document.getElementById('note-list')?.classList.remove('open');
    }
  });

  // Клик вне мобильных панелей закрывает их
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      const sidebar = document.getElementById('sidebar');
      if (
        sidebar?.classList.contains('open') &&
        !sidebar.contains(target) &&
        !target.closest('.topbar-mobile')
      ) {
        sidebar.classList.remove('open');
      }
    }
    if (window.matchMedia('(max-width: 720px)').matches) {
      const list = document.getElementById('note-list');
      if (
        list?.classList.contains('open') &&
        !list.contains(target) &&
        !target.closest('.list-toggle')
      ) {
        list.classList.remove('open');
      }
    }
  });
}

async function boot() {
  if (!api) {
    document.querySelector('.boot-sub').textContent =
      'Это окно должно открываться внутри Electron. Запустите npm start.';
    return;
  }
  registerBuiltinWidgets();
  await initState();
  await loadUserWidgets();
  applyThemeById(state.settings.theme, state.settings);
  applyLayout(state.settings);

  mountSidebar($('#sidebar'));
  mountNoteList($('#note-list'));
  mountTopbar($('#note-topbar'));
  mountEditor($('#editor'));
  mountRightPanel({
    panelEl: $('#right-panel'),
    tabsEl: $('#right-tabs'),
    previewEl: $('#preview-pane'),
    widgetsEl: $('#widgets-pane'),
  });
  mountAiPanel($('#ai-panel'));
  mountSettings($('#settings-panel'));
  mountStatusbar($('#statusbar'));

  setupEvents();
  document.title = activeNote() ? `${activeNote().title} — NMB Notes` : 'NMB Notes';

  const bootEl = $('#boot');
  bootEl?.classList.add('done');
  setTimeout(() => bootEl?.remove(), 420);
}

boot().catch((error) => {
  console.error('[boot]', error);
  const bootEl = $('#boot');
  if (bootEl) {
    const sub = bootEl.querySelector('.boot-sub');
    if (sub) sub.textContent = `Ошибка запуска: ${error.message}`;
  }
});
