import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { toast, notifyError } from '../../toast.js';
import { confirmDialog } from '../../modal.js';
import {
  state,
  applyVault,
  emptyTrash,
  flushNotes,
  setView,
} from '../../state.js';
import { section, note, statBox, actionsRow, button } from './shared.js';

const api = window.api;

export function renderDataSettings({ refresh }) {
  const wrap = h('div');
  const info = state.info || {};
  const paths = info.paths || {};
  const stats = {
    notes: state.vault.notes.filter((note) => !note.deletedAt).length,
    trash: state.vault.notes.filter((note) => note.deletedAt).length,
    folders: state.vault.folders.length,
    words: 0,
  };

  const wordsEl = h('div', { class: 'value', text: '…' });
  const wordsBox = h(
    'div',
    { class: 'stat-box' },
    wordsEl,
    h('div', { class: 'label', text: 'слов' })
  );
  const grid = h(
    'div',
    { class: 'stat-grid' },
    statBox(stats.notes, 'заметок'),
    statBox(stats.trash, 'в корзине'),
    statBox(stats.folders, 'папок'),
    wordsBox
  );

  api.vault
    .stats()
    .then((data) => {
      wordsEl.textContent = String(data.words ?? 0);
    })
    .catch(() => {
      wordsEl.textContent = '—';
    });

  wrap.appendChild(section('Хранилище', grid));

  wrap.appendChild(
    section(
      'Резервные копии и экспорт',
      note(
        'Раз в день приложение создаёт резервную копию vault и настроек в папке backups (хранятся 10 последних). Экспорт JSON можно использовать для переноса на другой компьютер; импорт объединяет данные по id.'
      ),
      actionsRow(
        button(
          'Создать резервную копию',
          async () => {
            try {
              await api.vault.backup();
              toast('Резервная копия создана');
            } catch (error) {
              notifyError(error);
            }
          },
          { variant: 'primary', icon: 'shield' }
        ),
        button(
          'Экспорт хранилища (.json)',
          async () => {
            try {
              const path = await api.vault.exportJson();
              if (path) toast('Хранилище экспортировано');
            } catch (error) {
              notifyError(error);
            }
          },
          { icon: 'download' }
        ),
        button(
          'Импорт хранилища (.json)',
          async () => {
            const ok = await confirmDialog({
              title: 'Импортировать хранилище?',
              message:
                'Заметки и папки из файла будут добавлены к текущим. Совпадения по id пропускаются. Это безопасно, но сделайте резервную копию.',
              confirmLabel: 'Импортировать',
            });
            if (!ok) return;
            try {
              const result = await api.vault.importJson();
              if (result) {
                applyVault(result.vault);
                setView({ type: 'all', folderId: null });
                toast(`Добавлено заметок: ${result.added}`);
                refresh();
              }
            } catch (error) {
              notifyError(error);
            }
          },
          { icon: 'upload' }
        ),
        button(
          'Импорт Markdown',
          async () => {
            try {
              const result = await api.vault.importMarkdown();
              if (result.imported) {
                applyVault(result.vault);
                setView({ type: 'all', folderId: null });
                toast(`Импортировано файлов: ${result.imported}`);
                refresh();
              }
            } catch (error) {
              notifyError(error);
            }
          },
          { icon: 'file' }
        )
      )
    )
  );

  if (paths.userData) {
    wrap.appendChild(
      section(
        'Расположение данных',
        h(
          'div',
          { class: 'path-row', title: paths.userData },
          h('span', { text: paths.userData }),
          h(
            'button',
            {
              class: 'btn icon-only',
              title: 'Скопировать путь',
              onClick: async () => {
                await api.app.copyText(paths.userData);
                toast('Путь скопирован');
              },
            },
            icon('copy')
          )
        ),
        actionsRow(
          button('Открыть папку данных', () => api.app.openFolder('userData'), {
            icon: 'folder',
          }),
          button('Папка тем', () => api.app.openFolder('themes'), { icon: 'palette' }),
          button('Папка виджетов', () => api.app.openFolder('widgets'), {
            icon: 'widgets',
          }),
          button('Папка бэкапов', () => api.app.openFolder('backups'), {
            icon: 'database',
          })
        )
      )
    );
  }

  wrap.appendChild(
    section(
      'Конфигурация',
      note(
        'Как в Obsidian, приложение читает необязательный JSON-конфиг. Через него задаются размеры окна, настройки по умолчанию для новых профилей и devTools. Пользовательские настройки из интерфейса всегда важнее defaults.'
      ),
      h(
        'div',
        { class: 'path-row', title: paths.config || '' },
        h('span', { text: paths.config || 'config/app.json' })
      ),
      actionsRow(
        button('Открыть config', () => api.app.openFolder('config'), { icon: 'folder' }),
        button(
          'Перечитать config',
          async () => {
            try {
              await api.app.reloadConfig();
              toast('Конфиг перечитан. Размер окна применится при следующем запуске.');
            } catch (error) {
              notifyError(error);
            }
          },
          { icon: 'refresh' }
        )
      )
    )
  );

  wrap.appendChild(
    section(
      'Опасные действия',
      actionsRow(
        button(
          'Очистить корзину',
          async () => {
            const ok = await confirmDialog({
              title: 'Очистить корзину?',
              message: 'Заметки из корзины будут удалены безвозвратно.',
              confirmLabel: 'Очистить',
              danger: true,
            });
            if (!ok) return;
            try {
              await flushNotes();
              await emptyTrash();
              toast('Корзина очищена');
              refresh();
            } catch (error) {
              notifyError(error);
            }
          },
          { small: true, icon: 'trash' }
        ),
        button(
          'Сбросить все настройки',
          async () => {
            const ok = await confirmDialog({
              title: 'Сбросить настройки?',
              message:
                'Тема, AI-настройки, виджеты и оформление вернутся к значениям по умолчанию. Заметки и API-ключ останутся на месте.',
              confirmLabel: 'Сбросить',
              danger: true,
            });
            if (!ok) return;
            try {
              await api.settings.reset();
              location.reload();
            } catch (error) {
              notifyError(error);
            }
          },
          { small: true, icon: 'refresh' }
        )
      ),
      note(
        `Версия данных: ${info.version || '—'} · Electron ${info.versions?.electron || '—'} · Chrome ${info.versions?.chrome || '—'}`,
        'warn'
      )
    )
  );

  return wrap;
}
