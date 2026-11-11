import { h } from '../../dom.js';
import { toast, notifyError } from '../../toast.js';
import { state, updateSettings } from '../../state.js';
import { section, note, toggleRow, rangeRow, actionsRow, button } from './shared.js';

export function renderEditorSettings({ refresh }) {
  const settings = state.settings;
  const wrap = h('div');

  wrap.appendChild(
    section(
      'Редактор',
      toggleRow(
        'Живой предпросмотр',
        'Показывать Markdown справа во время набора',
        settings.editor.livePreview,
        (value) => updateSettings({ editor: { livePreview: value } }).catch(notifyError)
      ),
      toggleRow(
        'Slash-меню',
        'Вызывать меню блоков символом / в начале строки',
        settings.editor.slashMenu,
        (value) => updateSettings({ editor: { slashMenu: value } }).catch(notifyError)
      ),
      toggleRow(
        'Умные списки',
        'Продолжать маркеры списков и чек-листов при Enter',
        settings.editor.smartLists,
        (value) => updateSettings({ editor: { smartLists: value } }).catch(notifyError)
      ),
      toggleRow(
        'Проверка орфографии',
        'Использовать встроенную проверку правописания',
        settings.editor.spellcheck,
        (value) => updateSettings({ editor: { spellcheck: value } }).catch(notifyError)
      ),
      rangeRow({
        label: 'Задержка автосохранения',
        desc: 'Как быстро заметка записывается на диск после ввода',
        min: 150,
        max: 1500,
        step: 50,
        value: settings.editor.autoSaveMs,
        suffix: 'мс',
        onChange: (value) => updateSettings({ editor: { autoSaveMs: value } }).catch(notifyError),
      })
    )
  );

  wrap.appendChild(
    note(
      'Заметки сохраняются автоматически и атомарно. Ctrl/Cmd+S сохраняет немедленно. При закрытии окно сначала дожидается записи изменений.'
    )
  );

  wrap.appendChild(
    section(
      'Сброс',
      actionsRow(
        button(
          'Сбросить настройки редактора',
          async () => {
            try {
              await updateSettings({
                editor: {
                  livePreview: true,
                  slashMenu: true,
                  smartLists: true,
                  spellcheck: true,
                  autoSaveMs: 400,
                },
              });
              toast('Настройки редактора сброшены');
              refresh();
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
      'Горячие клавиши',
      h(
        'div',
        { class: 'shortcut-grid' },
        ...shortcutRows([
          ['Новая заметка', 'Ctrl/Cmd + N'],
          ['Поиск', 'Ctrl/Cmd + K'],
          ['Сохранить сейчас', 'Ctrl/Cmd + S'],
          ['AI-панель', 'Ctrl/Cmd + E'],
          ['Предпросмотр', 'Ctrl/Cmd + Shift + Y'],
          ['Виджеты', 'Ctrl/Cmd + Shift + W'],
          ['Настройки', 'Ctrl/Cmd + ,'],
          ['Дублировать заметку', 'Ctrl/Cmd + Shift + D'],
          ['Найти в тексте', 'Ctrl/Cmd + F'],
        ])
      )
    )
  );

  return wrap;
}

function shortcutRows(rows) {
  return rows.flatMap(([label, keys]) => [
    h('b', { text: label }),
    h('span', { style: { textAlign: 'right' } }, h('kbd', { text: keys })),
  ]);
}
