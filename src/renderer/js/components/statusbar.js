import { h, clear, countWords, readingTime } from '../dom.js';
import { icon } from '../icons.js';
import { state, on, activeNote, folderById, emit } from '../state.js';

export function mountStatusbar(root) {
  const left = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: '0' } });
  const right = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  clear(root);
  root.append(left, h('div', { class: 'spacer' }), right);

  const render = () => {
    clear(left);
    clear(right);
    const note = activeNote();
    const words = countWords(note?.body || '');
    const saveText =
      state.saveState === 'saving'
        ? 'Сохранение…'
        : state.saveState === 'error'
          ? 'Ошибка сохранения'
          : 'Сохранено';
    const leftItems = [
      h(
        'span',
        { class: 'statusbar-item', title: 'Все изменения сохраняются на диск' },
        h('span', {
          class: `save-dot ${state.saveState === 'saving' ? 'saving' : state.saveState === 'error' ? 'error' : ''}`,
        }),
        h('span', { text: saveText })
      ),
      note
        ? h(
            'span',
            { class: 'statusbar-item' },
            icon('file'),
            h('span', { text: `${words} слов` })
          )
        : null,
      note
        ? h(
            'span',
            { class: 'statusbar-item' },
            icon('clock'),
            h('span', { text: `~${readingTime(note.body)} мин` })
          )
        : null,
      note?.folderId && folderById(note.folderId)
        ? h(
            'span',
            { class: 'statusbar-item' },
            icon('folder'),
            h('span', { text: folderById(note.folderId).name })
          )
        : null,
    ].filter(Boolean);
    left.append(...leftItems);

    const themeName = themeLabel();
    if (state.updateInfo?.available) {
      right.append(
        h(
          'button',
          {
            class: 'statusbar-item',
            style: { color: 'var(--accent)' },
            title: 'Доступно обновление — открыть настройки',
            onClick: () => emit('ui:open-settings', { tab: 'updates' }),
          },
          icon('download'),
          h('span', { text: `Обновление ${state.updateInfo.latestVersion}` })
        )
      );
    }
    right.append(
      h(
        'button',
        {
          class: 'statusbar-item',
          title: 'Сменить тему',
          onClick: () => emit('ui:open-settings', { tab: 'appearance' }),
        },
        icon('palette'),
        h('span', { text: themeName })
      ),
      h(
        'button',
        {
          class: 'statusbar-item',
          title: 'Настройки AI',
          onClick: () => emit('ui:open-settings', { tab: 'ai' }),
        },
        h('span', {
          class: `ai-status-dot${state.aiKeyStatus?.set ? ' ready' : ''}`,
        }),
        h('span', {
          text: state.aiKeyStatus?.set
            ? state.settings?.ai?.model || 'AI'
            : 'AI не настроен',
        })
      ),
      h(
        'span',
        { class: 'statusbar-item', title: 'Данные хранятся только на этом устройстве' },
        icon('shield'),
        h('span', { text: 'локально' })
      )
    );
  };

  const debounced = (() => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    };
  })();

  render();
  on('note:changed', debounced);
  on('note:selected', render);
  on('save:state', render);
  on('save:error', render);
  on('settings:changed', render);
  on('ai:key-changed', render);
  on('theme:applied', render);
  on('updates:checked', render);
  on('updates:available', render);
}

function themeLabel() {
  const theme = state.themes.find((entry) => entry.id === state.settings?.theme);
  return theme?.name || 'Тема';
}
