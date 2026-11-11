import { h, clear, formatDate, modKey } from '../dom.js';
import { icon } from '../icons.js';
import { confirmDialog } from '../modal.js';
import { notifyError, toast } from '../toast.js';
import { stripMarkdown } from '../markdown.js';
import {
  state,
  on,
  selectNote,
  setSearch,
  visibleNotes,
  viewTitle,
  createNote,
  toggleFavorite,
  deleteNote,
  restoreNote,
  emptyTrash,
  folderById,
  emit,
} from '../state.js';

export function mountNoteList(root) {
  let searchInput = null;
  let clearButton = null;
  let titleEl = null;
  let countEl = null;
  let actionSlot = null;
  let entriesEl = null;

  const syncHeader = () => {
    const notes = visibleNotes();
    titleEl.textContent = viewTitle();
    countEl.textContent = String(notes.length);
    clear(actionSlot);

    if (state.view.type === 'trash') {
      actionSlot.appendChild(
        h(
          'button',
          {
            class: 'btn icon-only',
            title: 'Очистить корзину',
            'aria-label': 'Очистить корзину',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Очистить корзину?',
                message: 'Все заметки из корзины будут удалены безвозвратно.',
                confirmLabel: 'Очистить',
                danger: true,
              });
              if (!ok) return;
              try {
                await emptyTrash();
                toast('Корзина очищена');
              } catch (error) {
                notifyError(error);
              }
            },
          },
          icon('trash')
        )
      );
    } else {
      actionSlot.appendChild(
        h(
          'button',
          {
            class: 'btn icon-only',
            title: `Новая заметка (${modKey()}+N)`,
            'aria-label': 'Новая заметка',
            onClick: async () => {
              try {
                await createNote();
                emit('editor:focus');
              } catch (error) {
                notifyError(error);
              }
            },
          },
          icon('plus')
        )
      );
    }
  };

  const renderEntries = () => {
    const notes = visibleNotes();
    clear(entriesEl);
    if (!notes.length) {
      entriesEl.appendChild(emptyState());
      return;
    }
    for (const note of notes) {
      entriesEl.appendChild(renderEntry(note));
    }
  };

  const emptyState = () => {
    let text = 'Здесь пока нет заметок.';
    let iconName = 'note';
    if (state.search.trim()) {
      text = `Ничего не найдено по запросу «${state.search.trim()}».`;
      iconName = 'search';
    } else if (state.view.type === 'favorites') {
      text = 'В избранном пока пусто. Отметьте заметку звездой.';
      iconName = 'star';
    } else if (state.view.type === 'trash') {
      text = 'Корзина пуста.';
      iconName = 'trash';
    } else if (state.view.type === 'folder') {
      text = 'В этой папке пока нет заметок.';
      iconName = 'folder';
    }
    return h(
      'div',
      { class: 'empty-list' },
      icon(iconName),
      h('div', { text })
    );
  };

  const renderEntry = (note) => {
    const isActive = note.id === state.vault.activeNoteId;
    const folder = note.folderId ? folderById(note.folderId) : null;
    const preview = stripMarkdown(note.body).slice(0, 160);
    const entry = h(
      'div',
      {
        class: `entry${isActive ? ' active' : ''}`,
        role: 'button',
        tabindex: '0',
        dataset: { id: note.id },
        'aria-current': isActive ? 'true' : 'false',
        onClick: () => {
          selectNote(note.id)
            .then(() => {
              if (window.matchMedia('(max-width: 720px)').matches) {
                root.classList.remove('open');
              }
            })
            .catch(notifyError);
        },
        onKeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectNote(note.id).catch(notifyError);
          }
        },
      },
      h(
        'div',
        { class: 'entry-top' },
        h('div', { class: 'entry-title', text: note.title }),
        note.favorite ? icon('star', 'icon fav-mark') : null
      ),
      h('div', { class: 'entry-preview', text: preview || 'Пустая заметка' }),
      h(
        'div',
        { class: 'entry-meta' },
        h('span', {
          text: note.deletedAt
            ? `Удалено ${formatDate(note.deletedAt)}`
            : formatDate(note.updatedAt),
        }),
        folder ? h('span', { class: 'dot' }) : null,
        folder ? h('span', { text: folder.name }) : null
      ),
      h(
        'div',
        { class: 'entry-actions' },
        note.deletedAt
          ? [
              h(
                'button',
                {
                  class: 'btn icon-only',
                  title: 'Восстановить',
                  onClick: async (event) => {
                    event.stopPropagation();
                    try {
                      await restoreNote(note.id);
                      toast('Заметка восстановлена');
                    } catch (error) {
                      notifyError(error);
                    }
                  },
                },
                icon('restore')
              ),
              h(
                'button',
                {
                  class: 'btn icon-only',
                  title: 'Удалить навсегда',
                  onClick: async (event) => {
                    event.stopPropagation();
                    const ok = await confirmDialog({
                      title: `Удалить «${note.title}» навсегда?`,
                      message: 'Это действие нельзя отменить.',
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
                },
                icon('trash')
              ),
            ]
          : [
              h(
                'button',
                {
                  class: 'btn icon-only',
                  title: note.favorite ? 'Убрать из избранного' : 'В избранное',
                  onClick: async (event) => {
                    event.stopPropagation();
                    try {
                      await toggleFavorite(note.id);
                    } catch (error) {
                      notifyError(error);
                    }
                  },
                },
                icon('star')
              ),
              h(
                'button',
                {
                  class: 'btn icon-only',
                  title: 'В корзину',
                  onClick: async (event) => {
                    event.stopPropagation();
                    try {
                      await deleteNote(note.id);
                      toast('Заметка перемещена в корзину');
                    } catch (error) {
                      notifyError(error);
                    }
                  },
                },
                icon('trash')
              ),
            ]
      )
    );
    return entry;
  };

  // Статичная шапка
  searchInput = h('input', {
    type: 'search',
    placeholder: 'Поиск заметок…',
    'aria-label': 'Поиск заметок',
    onInput: (event) => setSearch(event.target.value),
    onKeydown: (event) => {
      if (event.key === 'Escape') {
        event.target.value = '';
        setSearch('');
        event.target.blur();
      }
    },
  });
  clearButton = h(
    'button',
    {
      class: 'clear-search',
      title: 'Очистить',
      'aria-label': 'Очистить поиск',
      onClick: () => {
        searchInput.value = '';
        setSearch('');
        searchInput.focus();
      },
    },
    icon('close')
  );
  titleEl = h('h2');
  countEl = h('span', { class: 'count' });
  actionSlot = h('div', { style: { display: 'flex', gap: '2px' } });
  entriesEl = h('div', { class: 'entries' });

  clear(root);
  root.appendChild(
    h(
      'div',
      { class: 'list-head' },
      titleEl,
      countEl,
      actionSlot
    )
  );
  root.appendChild(
    h(
      'div',
      { class: 'search-box' },
      icon('search'),
      searchInput,
      clearButton
    )
  );
  root.appendChild(entriesEl);

  const syncSearch = () => {
    if (searchInput.value !== state.search) searchInput.value = state.search;
    clearButton.classList.toggle('visible', Boolean(state.search));
  };

  const renderAll = () => {
    syncHeader();
    syncSearch();
    renderEntries();
  };

  const updateActive = () => {
    for (const entry of entriesEl.querySelectorAll('.entry')) {
      const isActive = entry.dataset.id === state.vault.activeNoteId;
      entry.classList.toggle('active', isActive);
      entry.setAttribute('aria-current', isActive ? 'true' : 'false');
      if (isActive) {
        entry.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  renderAll();
  on('vault:changed', renderAll);
  on('view:changed', renderAll);
  on('search:changed', () => {
    syncSearch();
    renderEntries();
  });
  on('note:selected', updateActive);
  on('note:meta', (note) => {
    if (!note) return;
    const entry = entriesEl.querySelector(`.entry[data-id="${CSS.escape(note.id)}"]`);
    if (!entry) {
      renderEntries();
      return;
    }
    const title = entry.querySelector('.entry-title');
    const preview = entry.querySelector('.entry-preview');
    if (title) title.textContent = note.title;
    if (preview) {
      preview.textContent = stripMarkdown(note.body).slice(0, 160) || 'Пустая заметка';
    }
  });
}
