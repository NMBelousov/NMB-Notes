import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { toast, notifyError, cleanErrorMessage } from '../../toast.js';
import { openModal, confirmDialog } from '../../modal.js';
import { state, updateSettings, refreshThemes } from '../../state.js';
import { themeSwatch, currentTheme } from '../../theme.js';
import { THEMES } from '../../../themes/index.js';
import { section, note, field, toggleRow, rangeRow, actionsRow, button } from './shared.js';

const api = window.api;

export function renderAppearance({ refresh }) {
  const settings = state.settings;
  const wrap = h('div');

  // ---------- Галерея тем ----------
  const gallery = h('div', { class: 'theme-gallery' });
  const darkThemes = state.themes.filter((theme) => theme.mode !== 'light' && theme.source !== 'user');
  const lightThemes = state.themes.filter((theme) => theme.mode === 'light' && theme.source !== 'user');
  const userThemes = state.themes.filter((theme) => theme.source === 'user');

  const addGroup = (label, themes) => {
    if (!themes.length) return;
    gallery.appendChild(h('div', { class: 'theme-group-label', text: label }));
    for (const theme of themes) {
      gallery.appendChild(themeCard(theme, settings.theme, refresh));
    }
  };
  addGroup('Тёмные темы Obsidian', darkThemes);
  addGroup('Светлые темы Obsidian', lightThemes);
  addGroup('Пользовательские темы', userThemes);

  wrap.appendChild(
    section(
      'Темы',
      note(
        'Палитры популярных тем Obsidian адаптированы под интерфейс NMB Notes. Свою тему можно импортировать JSON-файлом — она появится здесь и в папке themes.'
      ),
      gallery,
      actionsRow(
        button('Импорт темы (JSON)', () => openThemeImport(refresh), { icon: 'upload' }),
        button('Экспорт текущей', () => exportCurrentTheme(), { icon: 'copy' }),
        button('Папка тем', () => api.app.openFolder('themes'), { icon: 'folder' })
      )
    )
  );

  // ---------- Шрифты ----------
  const uiFont = selectInput(
    [
      ['system', 'Системный'],
      ['serif', 'Serif'],
      ['mono', 'Моноширинный'],
    ],
    settings.appearance.uiFont,
    (value) => updateSettings({ appearance: { uiFont: value } }).catch(notifyError)
  );
  const editorFont = selectInput(
    [
      ['mono', 'Моноширинный'],
      ['serif', 'Serif'],
      ['sans', 'Без засечек'],
    ],
    settings.appearance.editorFont,
    (value) => updateSettings({ appearance: { editorFont: value } }).catch(notifyError)
  );

  wrap.appendChild(
    section(
      'Шрифты и размер',
      field('Шрифт интерфейса', 'Меню, списки и предпросмотр', uiFont),
      field('Шрифт редактора', 'Текст заметки', editorFont),
      rangeRow({
        label: 'Размер шрифта редактора',
        desc: 'От 11 до 28 px',
        min: 11,
        max: 28,
        step: 1,
        value: settings.appearance.editorFontSize,
        suffix: 'px',
        onChange: (value) => updateSettings({ appearance: { editorFontSize: value } }).catch(notifyError),
      }),
      rangeRow({
        label: 'Межстрочный интервал',
        desc: 'Высота строки в редакторе',
        min: 1.3,
        max: 2.4,
        step: 0.05,
        value: settings.appearance.lineHeight,
        format: (value) => Number(value).toFixed(2),
        onChange: (value) => updateSettings({ appearance: { lineHeight: value } }).catch(notifyError),
      })
    )
  );

  // ---------- Акцент и плотность ----------
  const accentInput = h('input', {
    class: 'color-input',
    type: 'color',
    value: settings.appearance.accent || themeSwatch(currentTheme()).accent,
    title: 'Акцентный цвет',
    onChange: (event) =>
      updateSettings({ appearance: { accent: event.target.value } }).catch(notifyError),
  });
  const accentReset = button(
    'Сбросить',
    () => {
      updateSettings({ appearance: { accent: '' } })
        .then(() => refresh())
        .catch(notifyError);
    },
    { small: true }
  );

  wrap.appendChild(
    section(
      'Акцент и плотность',
      field(
        'Акцентный цвет',
        'Переопределяет цвет текущей темы',
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, accentInput, accentReset)
      ),
      toggleRow(
        'Компактный интерфейс',
        'Меньше высота верхней панели и строки состояния',
        settings.appearance.compact,
        (value) => updateSettings({ appearance: { compact: value } }).catch(notifyError)
      )
    )
  );

  // ---------- Свой CSS ----------
  const cssArea = h('textarea', {
    class: 'textarea',
    placeholder: '/* Например: .preview-pane h1 { letter-spacing: -0.02em; } */',
    spellcheck: 'false',
  });
  cssArea.value = settings.appearance.customCss || '';
  wrap.appendChild(
    section(
      'Свой CSS',
      note(
        'Дополнительные стили поверх темы — как snippets в Obsidian. CSS применяется сразу после сохранения и хранится в настройках.'
      ),
      cssArea,
      actionsRow(
        button(
          'Сохранить CSS',
          () => {
            updateSettings({ appearance: { customCss: cssArea.value } })
              .then(() => toast('CSS сохранён'))
              .catch(notifyError);
          },
          { variant: 'primary', small: true, icon: 'save' }
        ),
        button(
          'Очистить',
          () => {
            cssArea.value = '';
            updateSettings({ appearance: { customCss: '' } })
              .then(() => toast('CSS очищен'))
              .catch(notifyError);
          },
          { small: true }
        )
      )
    )
  );

  wrap.appendChild(
    note(
      `Доступно тем: ${state.themes.length} · встроенных: ${THEMES.length} · пользовательских: ${state.userThemes.length}. Новые темы подхватываются из папки themes при запуске.`
    )
  );

  return wrap;
}

function themeCard(theme, activeId, refresh) {
  const swatch = themeSwatch(theme);
  const card = h(
    'div',
    {
      class: `theme-card${theme.id === activeId ? ' active' : ''}`,
      role: 'button',
      tabindex: '0',
      title: theme.credit || theme.name,
      onClick: async () => {
        try {
          await updateSettings({ theme: theme.id });
          toast(`Тема: ${theme.name}`);
          refresh();
        } catch (error) {
          notifyError(error);
        }
      },
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.click();
        }
      },
    },
    h(
      'div',
      { class: 'theme-swatch', style: { background: swatch.bg } },
      h(
        'div',
        { class: 'theme-swatch-top', style: { background: swatch.panel } },
        h('div', { class: 'theme-swatch-side', style: { background: swatch.sidebar } }),
        h(
          'div',
          { class: 'theme-swatch-bars' },
          ...[16, 24, 20, 10].map((height) =>
            h('i', {
              style: { height: `${height}px`, background: swatch.accent },
            })
          )
        )
      ),
      h('div', { class: 'theme-swatch-bottom', style: { background: swatch.accent } })
    ),
    h(
      'div',
      { class: 'theme-card-name' },
      h('span', { text: theme.name }),
      theme.id === activeId ? icon('check', 'icon check') : null
    ),
    h('div', {
      class: 'theme-card-meta',
      text: theme.source === 'user' ? 'своя тема' : theme.mode === 'light' ? 'светлая' : 'тёмная',
    })
  );
  if (theme.source === 'user') {
    card.appendChild(
      h(
        'span',
        {
          class: 'theme-delete',
          role: 'button',
          title: 'Удалить тему',
          onClick: async (event) => {
            event.stopPropagation();
            const ok = await confirmDialog({
              title: `Удалить тему «${theme.name}»?`,
              message: 'Файл темы будет удалён из папки themes.',
              confirmLabel: 'Удалить',
              danger: true,
            });
            if (!ok) return;
            try {
              await api.themes.delete(theme.id);
              await refreshThemes();
              if (state.settings.theme === theme.id) {
                await updateSettings({ theme: 'obsidian-dark' });
              }
              toast('Тема удалена');
              refresh();
            } catch (error) {
              notifyError(error);
            }
          },
        },
        icon('trash')
      )
    );
  }
  return card;
}

function selectInput(options, value, onChange) {
  const select = h(
    'select',
    { class: 'select', onChange: (event) => onChange(event.target.value) },
    ...options.map(([val, label]) => h('option', { value: val, text: label }))
  );
  select.value = value;
  return select;
}

function exportCurrentTheme() {
  const theme = currentTheme();
  const payload = {
    id: theme.id,
    name: theme.name,
    mode: theme.mode,
    credit: theme.credit || '',
    tokens: theme.tokens,
    css: theme.css || '',
  };
  api.app
    .copyText(JSON.stringify(payload, null, 2))
    .then(() => toast('JSON темы скопирован'))
    .catch(notifyError);
}

function openThemeImport(refresh) {
  const area = h('textarea', {
    class: 'textarea',
    style: { minHeight: '260px' },
    placeholder: '{\n  "id": "my-theme",\n  "name": "Моя тема",\n  "mode": "dark",\n  "tokens": { "bg": "#1e1e1e", "accent": "#8a5cf5", ... }\n}',
    spellcheck: 'false',
  });
  const error = h('div', { class: 'studio-error', style: { display: 'none' } });
  const modal = openModal({
    title: 'Импорт темы',
    wide: true,
    body: h(
      'div',
      {},
      note(
        'Вставьте JSON темы. Обязательны поля tokens (объект CSS-переменных) и name; id сгенерируется автоматически, если его нет.'
      ),
      area,
      error
    ),
    footer: h(
      'div',
      { class: 'modal-foot' },
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onClick: () => modal.close() }, 'Отмена'),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: async () => {
            error.style.display = 'none';
            let parsed;
            try {
              parsed = JSON.parse(area.value);
            } catch (parseError) {
              error.textContent = `Ошибка JSON: ${parseError.message}`;
              error.style.display = 'block';
              return;
            }
            if (!parsed || typeof parsed !== 'object') {
              error.textContent = 'Нужен JSON-объект темы';
              error.style.display = 'block';
              return;
            }
            if (!parsed.id || !/^[a-z0-9][a-z0-9-_]{1,60}$/.test(parsed.id)) {
              parsed.id = `custom-${Date.now().toString(36)}`;
            }
            if (!parsed.name) parsed.name = 'Моя тема';
            try {
              await api.themes.save(parsed);
              await refreshThemes();
              await updateSettings({ theme: parsed.id });
              toast('Тема импортирована');
              modal.close();
              refresh();
            } catch (saveError) {
              error.textContent = cleanErrorMessage(saveError);
              error.style.display = 'block';
            }
          },
        },
        'Импортировать'
      )
    ),
  });
  setTimeout(() => area.focus(), 50);
}
