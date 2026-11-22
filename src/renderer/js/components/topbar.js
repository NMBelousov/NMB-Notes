import { h, modKey } from '../dom.js';
import { icon } from '../icons.js';
import { confirmDialog } from '../modal.js';
import { notifyError, toast } from '../toast.js';
import { showDropdown } from './dropdown.js';
import {
  state,
  on,
  emit,
  activeNote,
  touchNote,
  toggleFavorite,
  moveNote,
  duplicateNote,
  deleteNote,
  restoreNote,
  exportNoteMarkdown,
  flushNotes,
} from '../state.js';

const api = window.api;

export function mountTopbar(root) {
  let titleInput = null;
  let folderSelect = null;
  let starBtn = null;
  let panelBtn = null;
  let aiBtn = null;
  let moreBtn = null;

  const syncTitle = () => {
    const note = activeNote();
    if (!titleInput) return;
    if (document.activeElement !== titleInput) {
      titleInput.value = note?.title || '';
    }
    titleInput.disabled = !note;
    titleInput.placeholder = note ? 'Название заметки' : 'Нет заметки';
  };

  const syncFolder = () => {
    const note = activeNote();
    if (!folderSelect) return;
    const options = [h('option', { value: '', text: 'Без папки' })];
    for (const folder of state.vault.folders) {
      options.push(h('option', { value: folder.id, text: folder.name }));
    }
    folderSelect.replaceChildren(...options);
    folderSelect.value = note?.folderId || '';
    folderSelect.disabled = !note || Boolean(note?.deletedAt);
  };

  const syncStar = () => {
    const note = activeNote();
    if (!starBtn) return;
    starBtn.classList.toggle('active', Boolean(note?.favorite));
    starBtn.title = note?.favorite ? 'Убрать из избранного' : 'В избранное';
  };

  const syncTabs = () => {
    aiBtn?.classList.toggle('active', state.aiOpen);
  };

  const showMore = () => {
    const note = activeNote();
    if (!note) return;
    showDropdown(moreBtn, [
      {
        icon: 'copy',
        label: 'Дублировать заметку',
        shortcut: `${modKey()}+Shift+D`,
        onClick: async () => {
          try {
            await duplicateNote(note.id);
            toast('Заметка продублирована');
          } catch (error) {
            notifyError(error);
          }
        },
      },
      {
        icon: 'download',
        label: 'Скачать .md',
        onClick: async () => {
          try {
            const path = await exportNoteMarkdown(note);
            if (path) toast('Markdown сохранён');
          } catch (error) {
            notifyError(error);
          }
        },
      },
      {
        icon: 'pdf',
        label: 'Экспорт в PDF',
        onClick: () => emit('ui:export-pdf'),
      },
      {
        icon: 'copy',
        label: 'Копировать Markdown',
        onClick: async () => {
          await api.app.copyText(note.body);
          toast('Markdown скопирован');
        },
      },
      { separator: true },
      note.deletedAt
        ? {
            icon: 'restore',
            label: 'Восстановить',
            onClick: async () => {
              try {
                await restoreNote(note.id);
                toast('Заметка восстановлена');
              } catch (error) {
                notifyError(error);
              }
            },
          }
        : {
            icon: 'trash',
            label: 'Переместить в корзину',
            danger: true,
            onClick: async () => {
              try {
                await deleteNote(note.id);
                toast('Заметка в корзине');
              } catch (error) {
                notifyError(error);
              }
            },
          },
      note.deletedAt
        ? {
            icon: 'trash',
            label: 'Удалить навсегда',
            danger: true,
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Удалить «${note.title}» навсегда?`,
                message: 'Восстановить заметку будет невозможно.',
                confirmLabel: 'Удалить',
                danger: true,
              });
              if (!ok) return;
              try {
                await deleteNote(note.id, true);
                toast('Заметка удалена');
              } catch (error) {
                notifyError(error);
              }
            },
          }
        : null,
    ]);
  };

  // Заголовок
  titleInput = h('input', {
    class: 'title-input',
    type: 'text',
    placeholder: 'Название заметки',
    'aria-label': 'Название заметки',
    onInput: (event) => {
      if (!activeNote()) return;
      touchNote({ title: event.target.value });
    },
    onBlur: (event) => {
      if (!activeNote()) return;
      if (!event.target.value.trim()) {
        event.target.value = 'Без названия';
        touchNote({ title: 'Без названия' });
      }
      flushNotes().catch(() => {});
    },
    onKeydown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
        emit('editor:focus');
      }
    },
  });

  folderSelect = h('select', {
    class: 'select topbar-folder',
    title: 'Папка заметки',
    'aria-label': 'Папка заметки',
    onChange: async (event) => {
      const note = activeNote();
      if (!note) return;
      try {
        await moveNote(note.id, event.target.value || null);
      } catch (error) {
        notifyError(error);
      }
    },
  });

  starBtn = h(
    'button',
    {
      class: 'btn icon-only',
      title: 'В избранное',
      'aria-label': 'В избранное',
      onClick: async () => {
        if (!activeNote()) return;
        try {
          await toggleFavorite();
        } catch (error) {
          notifyError(error);
        }
      },
    },
    icon('star')
  );

  const menuBtn = h(
    'button',
    {
      class: 'btn icon-only sidebar-toggle',
      title: 'Показать/скрыть меню',
      'aria-label': 'Показать или скрыть меню',
      onClick: () => {
        if (window.matchMedia('(max-width: 900px)').matches) {
          document.getElementById('sidebar')?.classList.toggle('open');
        } else {
          emit('ui:toggle-sidebar');
        }
      },
    },
    icon('menu')
  );

  const listBtn = h(
    'button',
    {
      class: 'btn icon-only list-toggle',
      title: 'Показать/скрыть список заметок',
      'aria-label': 'Показать или скрыть список заметок',
      onClick: () => {
        if (window.matchMedia('(max-width: 720px)').matches) {
          document.getElementById('note-list')?.classList.toggle('open');
        } else {
          emit('ui:toggle-note-list');
        }
      },
    },
    icon('list')
  );

  panelBtn = h(
    'button',
    {
      class: 'btn icon-only',
      title: 'Панель предпросмотра и виджетов',
      'aria-label': 'Открыть или закрыть панель предпросмотра',
      onClick: () => emit('ui:toggle-right-panel'),
    },
    icon('panelRight')
  );

  aiBtn = h(
    'button',
    {
      class: 'btn icon-only',
      title: `AI-помощник (${modKey()}+E)`,
      'aria-label': 'AI-помощник',
      onClick: () => emit('ai:toggle'),
    },
    icon('ai')
  );

  moreBtn = h(
    'button',
    {
      class: 'btn icon-only',
      title: 'Ещё',
      'aria-label': 'Ещё действия',
      onClick: showMore,
    },
    icon('more')
  );

  root.appendChild(menuBtn);
  root.appendChild(listBtn);
  root.appendChild(titleInput);
  root.appendChild(folderSelect);
  root.appendChild(starBtn);
  root.appendChild(
    h(
      'div',
      { class: 'topbar-actions' },
      panelBtn,
      h('div', { class: 'topbar-sep' }),
      aiBtn,
      moreBtn
    )
  );

  syncTitle();
  syncFolder();
  syncStar();
  syncTabs();

  on('note:selected', () => {
    syncTitle();
    syncFolder();
    syncStar();
  });
  on('note:changed', () => {
    syncStar();
  });
  on('note:meta', () => {
    syncTitle();
  });
  on('vault:changed', () => {
    syncFolder();
    syncStar();
    syncTitle();
  });
  on('view:changed', () => {
    syncFolder();
    syncTitle();
  });
  on('ai:state', syncTabs);
  on('ui:right-changed', ({ open } = {}) => {
    panelBtn?.classList.toggle('active', open !== false);
    panelBtn?.setAttribute(
      'title',
      open === false ? 'Открыть панель предпросмотра' : 'Скрыть панель предпросмотра'
    );
  });
}
