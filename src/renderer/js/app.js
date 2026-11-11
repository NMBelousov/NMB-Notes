import { $, h } from './dom.js';
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
  const rows = [
    ['Новая заметка', 'Ctrl/Cmd + N'],
    ['Новая папка', 'Ctrl/Cmd + Shift + N'],
    ['Поиск заметок', 'Ctrl/Cmd + K'],
    ['Найти (фокус в поиск)', 'Ctrl/Cmd + F'],
    ['Сохранить сейчас', 'Ctrl/Cmd + S'],
    ['AI-панель', 'Ctrl/Cmd + E'],
    ['Настройки', 'Ctrl/Cmd + ,'],
    ['Предпросмотр', 'Ctrl/Cmd + Shift + Y'],
    ['Виджеты', 'Ctrl/Cmd + Shift + W'],
    ['Дублировать заметку', 'Ctrl/Cmd + Shift + D'],
    ['Экспорт в PDF', 'Ctrl/Cmd + Shift + P'],
    ['Импорт Markdown', 'Ctrl/Cmd + O'],
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

function setupMenuActions() {
  api.app.onMenuAction(async ({ action, payload }) => {
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
  });
}

function setupGlobalKeys() {
  document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      const note = activeNote();
      if (note) {
        duplicateNote(note.id)
          .then(() => toast('Заметка продублирована'))
          .catch(notifyError);
      }
      return;
    }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusSearch();
      return;
    }
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
    }
  });
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
