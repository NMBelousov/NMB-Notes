import { h } from '../../dom.js';
import { state } from '../../state.js';
import { openWidgetGuide } from './widgetStudio.js';
import { section, note, actionsRow, button, keyValueRows } from './shared.js';

const api = window.api;

export function renderAbout() {
  const info = state.info || {};
  const wrap = h('div');

  wrap.appendChild(
    h(
      'div',
      {
        class: 'settings-note success',
        style: {
          display: 'flex',
          gap: '13px',
          alignItems: 'center',
          padding: '16px',
          marginBottom: '18px',
        },
      },
      h(
        'div',
        {
          style: {
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #101018))',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: '3px',
            paddingBottom: '12px',
            flex: '0 0 auto',
          },
        },
        ...[14, 26, 20, 10].map((height) =>
          h('span', {
            style: {
              display: 'block',
              width: '4px',
              borderRadius: '2px',
              height: `${height}px`,
              background: 'rgba(255,255,255,.92)',
            },
          })
        )
      ),
      h(
        'div',
        {},
        h('div', {
          style: { fontSize: '17px', fontWeight: '700', color: 'var(--text-bright)' },
          text: 'NMB Notes',
        }),
        h('div', {
          style: { fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' },
          text: `Версия ${info.version || '1.0.0'} · ${info.platform || ''} ${info.arch || ''}`,
        }),
        h('div', {
          style: { fontSize: '10.5px', color: 'var(--text-dim)', marginTop: '5px' },
          text: 'Локальный редактор заметок с четырьмя колонками, AI и виджетами',
        })
      )
    )
  );

  wrap.appendChild(
    section(
      'Среда',
      keyValueRows([
        ['Electron', info.versions?.electron || '—'],
        ['Chromium', info.versions?.chrome || '—'],
        ['Node.js', info.versions?.node || '—'],
        ['Платформа', `${info.platform || '—'} / ${info.arch || '—'}`],
        ['Данные', info.paths?.userData || '—'],
      ])
    )
  );

  wrap.appendChild(
    section(
      'Безопасность',
      note('Данные остаются на устройстве. Приложение не содержит телеметрии и аналитики.', 'success'),
      h(
        'ul',
        { style: { paddingLeft: '19px', fontSize: '12px', lineHeight: '1.8', color: 'var(--text-dim)' } },
        h('li', { text: 'API-ключ DeepSeek шифруется и не доступен renderer-процессу.' }),
        h('li', { text: 'Контекст заметки отправляется только при включённом переключателе и только по вашему запросу.' }),
        h('li', { text: 'Renderer изолирован: contextIsolation, sandbox, без Node.js интеграции.' }),
        h('li', { text: 'Внешние ссылки открываются в системном браузере; навигация внутри окна заблокирована.' }),
        h('li', { text: 'Пользовательские виджеты не имеют доступа к Node.js и сети; устанавливайте только доверенный код.' }),
        h('li', { text: 'Заметки пишутся атомарно и ежедневно резервируются в папке backups.' })
      )
    )
  );

  wrap.appendChild(
    section(
      'Возможности',
      h(
        'ul',
        { style: { paddingLeft: '19px', fontSize: '12px', lineHeight: '1.8', color: 'var(--text-dim)' } },
        h('li', { text: 'Четыре колонки: меню, список, редактор, предпросмотр/виджеты.' }),
        h('li', { text: 'Slash-меню, живой Markdown, чек-листы, таблицы, wiki-ссылки [[...]].' }),
        h('li', { text: 'AI-панель DeepSeek с потоковым ответом и действиями «вставить/копировать».' }),
        h('li', { text: '16 тем Obsidian, свои темы, акцентный цвет, кастомный CSS.' }),
        h('li', { text: 'Компонентные виджеты, встроенные и создаваемые через AI.' }),
        h('li', { text: 'Папки, теги, избранное, корзина, импорт/экспорт Markdown, PDF, бэкапы.' })
      )
    )
  );

  wrap.appendChild(
    section(
      'Темы и вдохновение',
      note(
        'Встроенные палитры — независимые порты популярных тем Obsidian: Default, Minimal, Catppuccin, Tokyo Night, Nord, Rosé Pine, Gruvbox, Dracula, Solarized, Blue Topaz, Things, One Dark, Everforest, Ayu. Права принадлежат авторам оригинальных тем.'
      )
    )
  );

  wrap.appendChild(
    section(
      'Помощь',
      actionsRow(
        button('Руководство по виджетам', () => openWidgetGuide(), { icon: 'book' }),
        button('Открыть папку данных', () => api.app.openFolder('userData'), {
          icon: 'folder',
        }),
        button('DeepSeek Platform', () => api.app.openExternal('https://platform.deepseek.com'), {
          icon: 'external',
        })
      ),
      note(
        'Исходный код приложения открыт в репозитории. Сборки для macOS (ARM/x64) и Windows x64 создаются GitHub Actions. Лицензия MIT.'
      )
    )
  );

  return wrap;
}
