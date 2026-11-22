import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { confirmDialog, promptDialog } from '../modal.js';
import { notifyError, toast } from '../toast.js';
import {
  state,
  on,
  setView,
  setSearch,
  createFolder,
  renameFolder,
  deleteFolder,
  emit,
  sidebarTags,
} from '../state.js';

export function mountSidebar(root) {
  const render = () => {
    const notes = state.vault.notes.filter((note) => !note.deletedAt);
    const trashCount = state.vault.notes.length - notes.length;
    const favCount = notes.filter((note) => note.favorite).length;
    const tags = state.ready ? sidebarTags() : [];
    const active = state.view;

    clear(root);
    root.appendChild(
      h(
        'div',
        { class: 'sidebar-head' },
        h('img', {
          class: 'brand-logo',
          src: 'assets/logo.png',
          alt: '',
          'aria-hidden': 'true',
        }),
        h(
          'div',
          { class: 'brand-text' },
          h('strong', { text: 'NMB Notes' }),
          h('small', {
            text: state.info ? `v${state.info.version} · локально` : 'локально',
          })
        )
      )
    );

    const scroll = h('div', { class: 'sidebar-scroll' });
    const nav = h('div');
    const navButton = (view, iconName, label, count) =>
      h(
        'button',
        {
          class: `nav-item${sameView(active, view) ? ' active' : ''}`,
          onClick: () => {
            setView(view);
            root.classList.remove('open');
          },
        },
        icon(iconName),
        h('span', { class: 'label', text: label }),
        count !== undefined ? h('span', { class: 'count', text: String(count) }) : null
      );

    nav.appendChild(navButton({ type: 'all' }, 'note', 'Все заметки', notes.length));
    nav.appendChild(
      navButton({ type: 'favorites' }, 'star', 'Избранное', favCount)
    );
    nav.appendChild(navButton({ type: 'trash' }, 'trash', 'Корзина', trashCount));
    scroll.appendChild(nav);

    const foldersSection = h('div', { class: 'side-section' });
    foldersSection.appendChild(
      h(
        'div',
        { class: 'side-section-head' },
        h('span', { text: 'Папки' }),
        h(
          'button',
          {
            class: 'btn icon-only',
            title: 'Новая папка',
            'aria-label': 'Новая папка',
            onClick: async () => {
              const name = await promptDialog({
                title: 'Новая папка',
                label: 'Название папки',
                placeholder: 'Например, Работа',
                confirmLabel: 'Создать',
              });
              if (!name) return;
              try {
                const folder = await createFolder(name);
                toast(`Папка «${folder.name}» создана`);
              } catch (error) {
                notifyError(error);
              }
            },
          },
          icon('plus')
        )
      )
    );

    if (!state.vault.folders.length) {
      foldersSection.appendChild(
        h('div', {
          class: 'w-empty',
          style: { padding: '3px 8px', fontSize: '10.5px' },
          text: 'Пока нет папок',
        })
      );
    } else {
      for (const folder of state.vault.folders) {
        const count = notes.filter((note) => note.folderId === folder.id).length;
        const row = h(
          'div',
          {
            class: `folder-item${
              active.type === 'folder' && active.folderId === folder.id ? ' active' : ''
            }`,
            role: 'button',
            tabindex: '0',
            onClick: () => {
              setView({ type: 'folder', folderId: folder.id });
              root.classList.remove('open');
            },
            onKeydown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setView({ type: 'folder', folderId: folder.id });
              }
            },
          },
          icon('folder'),
          h('span', { class: 'label', text: folder.name }),
          h('span', { class: 'count', text: String(count) }),
          h(
            'span',
            { class: 'folder-actions' },
            h(
              'button',
              {
                class: 'btn icon-only',
                title: 'Переименовать',
                onClick: async (event) => {
                  event.stopPropagation();
                  const name = await promptDialog({
                    title: 'Переименовать папку',
                    label: 'Название',
                    value: folder.name,
                  });
                  if (!name) return;
                  try {
                    await renameFolder(folder.id, name);
                  } catch (error) {
                    notifyError(error);
                  }
                },
              },
              icon('edit')
            ),
            h(
              'button',
              {
                class: 'btn icon-only',
                title: 'Удалить папку',
                onClick: async (event) => {
                  event.stopPropagation();
                  const ok = await confirmDialog({
                    title: `Удалить папку «${folder.name}»?`,
                    message:
                      'Заметки не удалятся — они просто останутся без папки.',
                    confirmLabel: 'Удалить папку',
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await deleteFolder(folder.id);
                    toast('Папка удалена');
                  } catch (error) {
                    notifyError(error);
                  }
                },
              },
              icon('trash')
            )
          )
        );
        foldersSection.appendChild(row);
      }
    }
    scroll.appendChild(foldersSection);

    if (tags.length) {
      const tagsSection = h('div', { class: 'side-section' });
      tagsSection.appendChild(
        h(
          'div',
          { class: 'side-section-head' },
          h('span', { text: 'Теги' })
        )
      );
      const wrap = h('div', { class: 'tag-list' });
      for (const { tag, count } of tags) {
        wrap.appendChild(
          h(
            'button',
            {
              class: 'tag-chip',
              title: `${count} заметок`,
              onClick: () => {
                setView({ type: 'all', folderId: null });
                setSearch(`#${tag}`);
                root.classList.remove('open');
              },
            },
            `#${tag}`
          )
        );
      }
      tagsSection.appendChild(wrap);
      scroll.appendChild(tagsSection);
    }

    root.appendChild(scroll);

    const footer = h('div', { class: 'sidebar-footer' });
    footer.appendChild(
      h(
        'button',
        {
          class: 'nav-item',
          onClick: async () => {
            emit('ui:open-settings', { tab: 'appearance' });
            root.classList.remove('open');
          },
        },
        icon('settings'),
        h('span', { class: 'label', text: 'Настройки' })
      )
    );
    footer.appendChild(
      h(
        'button',
        {
          class: 'nav-item',
          onClick: () => emit('ai:open', { prompt: '' }),
        },
        icon('ai'),
        h('span', { class: 'label', text: 'AI-помощник' })
      )
    );
    root.appendChild(footer);
  };

  render();
  on('vault:changed', render);
  on('view:changed', render);
  on('settings:changed', render);
  on('themes:changed', render);
  let tagTimer = null;
  on('note:meta', () => {
    clearTimeout(tagTimer);
    tagTimer = setTimeout(render, 300);
  });
}

function sameView(a, b) {
  return a.type === b.type && (a.type !== 'folder' || a.folderId === b.folderId);
}
