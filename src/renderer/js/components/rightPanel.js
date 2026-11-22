import { h, clear, debounce, countWords } from '../dom.js';
import { icon } from '../icons.js';
import { toast, notifyError } from '../toast.js';
import { showDropdown } from './dropdown.js';
import { renderMarkdown } from '../markdown.js';
import {
  state,
  on,
  emit,
  activeNote,
  selectNote,
  updateSettings,
} from '../state.js';
import {
  getWidget,
  listWidgets,
  mountWidget,
} from '../widgets/registry.js';

const api = window.api;

export function mountRightPanel({ panelEl, tabsEl, previewEl, widgetsEl }) {
  let inlineCleanups = [];
  let widgetCleanups = [];
  let lastWidgetSignature = '';
  let previousSettings = state.settings;
  const collapsed = new Set();

  // ---------- Вкладки ----------
  const tabs = [
    { id: 'preview', label: 'Предпросмотр', icon: 'eye' },
    { id: 'widgets', label: 'Виджеты', icon: 'widgets' },
  ];
  const tabButtons = new Map();

  const isNarrow = () => window.matchMedia('(max-width: 1120px)').matches;
  const isPanelOpen = () =>
    isNarrow()
      ? panelEl.classList.contains('open')
      : !panelEl.classList.contains('collapsed');

  const setPanelOpen = (open) => {
    panelEl.classList.toggle('collapsed', !open && !isNarrow());
    panelEl.classList.toggle('open', open);
    if (!isNarrow()) {
      document
        .getElementById('preview-splitter')
        ?.classList.toggle('hidden', !open);
    }
    emit('ui:right-changed', { tab: state.rightTab, open });
  };

  const renderTabs = () => {
    clear(tabsEl);
    tabButtons.clear();
    for (const tab of tabs) {
      const button = h(
        'button',
        {
          class: `panel-tab${state.rightTab === tab.id ? ' active' : ''}`,
          title: tab.label,
          onClick: () => setTab(tab.id),
        },
        icon(tab.icon),
        h('span', { text: tab.label })
      );
      tabButtons.set(tab.id, button);
      tabsEl.appendChild(button);
    }
    const spacer = h('div', { class: 'spacer' });
    tabsEl.appendChild(spacer);
    tabsEl.appendChild(
      h(
        'button',
        {
          class: 'btn icon-only',
          title:
            state.rightTab === 'widgets'
              ? 'Настройки виджетов'
              : 'Настройки предпросмотра',
          'aria-label': 'Настройки этого раздела',
          onClick: () =>
            emit('ui:open-settings', {
              tab: state.rightTab === 'widgets' ? 'widgets' : 'appearance',
            }),
        },
        icon('settings')
      )
    );
    tabsEl.appendChild(
      h(
        'button',
        {
          class: 'btn icon-only',
          title: 'Закрыть панель',
          'aria-label': 'Закрыть панель',
          onClick: () => setPanelOpen(false),
        },
        icon('close')
      )
    );
  };

  const syncTabs = () => {
    for (const [id, button] of tabButtons) {
      button.classList.toggle('active', id === state.rightTab);
    }
  };

  const setTab = (tab, { persist = true } = {}) => {
    const next = tab === 'widgets' ? 'widgets' : 'preview';
    const changed = state.rightTab !== next;
    state.rightTab = next;
    syncTabs();
    renderTabs();
    previewEl.hidden = next !== 'preview';
    widgetsEl.hidden = next !== 'widgets';
    setPanelOpen(true);
    if (next === 'preview') renderPreview();
    else renderWidgets(true);
    if (persist && changed) {
      updateSettings({ layout: { rightTab: next } }).catch(() => {});
    }
  };

  on('ui:show-right-tab', ({ tab }) => setTab(tab));
  on('ui:toggle-right-panel', () => setPanelOpen(!isPanelOpen()));

  // ---------- Предпросмотр ----------
  const toolbar = h('div', { class: 'preview-toolbar' });
  const statsEl = h('span');
  const contentEl = h('div', { class: 'preview-content' });
  previewEl.appendChild(toolbar);
  previewEl.appendChild(contentEl);

  const updateToolbar = () => {
    clear(toolbar);
    const note = activeNote();
    const words = countWords(note?.body || '');
    toolbar.appendChild(icon('eye'));
    toolbar.appendChild(h('span', { text: 'Предпросмотр' }));
    toolbar.appendChild(h('span', { class: 'spacer' }));
    toolbar.appendChild(
      h('span', {
        text: note ? `${words} слов · ~${Math.max(1, Math.round(words / 200))} мин` : '',
      })
    );
    toolbar.appendChild(
      h(
        'button',
        {
          class: 'btn icon-only',
          title: 'Экспорт в PDF',
          onClick: () => emit('ui:export-pdf'),
        },
        icon('pdf')
      )
    );
    toolbar.appendChild(
      h(
        'button',
        {
          class: 'btn icon-only',
          title: 'Скопировать Markdown',
          onClick: async () => {
            if (!note) return;
            await api.app.copyText(note.body);
            toast('Markdown скопирован');
          },
        },
        icon('copy')
      )
    );
  };

  const cleanupInline = () => {
    for (const fn of inlineCleanups) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    inlineCleanups = [];
  };

  const renderPreview = () => {
    const note = activeNote();
    cleanupInline();
    updateToolbar();
    if (!note) {
      contentEl.innerHTML = '';
      contentEl.appendChild(
        h(
          'div',
          { class: 'preview-empty' },
          icon('note'),
          h('div', { text: 'Выберите или создайте заметку' })
        )
      );
      return;
    }
    if (state.settings?.editor?.livePreview === false) {
      contentEl.innerHTML = '';
      contentEl.appendChild(
        h(
          'div',
          { class: 'preview-empty' },
          icon('eye'),
          h('div', { text: 'Живой предпросмотр выключен' }),
          h(
            'button',
            {
              class: 'btn ghost small',
              onClick: () => updateSettings({ editor: { livePreview: true } }),
            },
            'Включить'
          )
        )
      );
      return;
    }
    contentEl.innerHTML = renderMarkdown(note.body);
    mountInlineWidgets();
  };

  const schedulePreview = debounce(() => {
    if (state.rightTab === 'preview') renderPreview();
    else updateToolbar();
  }, 120);

  const mountInlineWidgets = () => {
    const nodes = contentEl.querySelectorAll('.inline-widget');
    for (const node of nodes) {
      const id = node.dataset.widgetId;
      const def = getWidget(id);
      if (!def) {
        node.appendChild(
          h('div', {
            class: 'widget-error',
            text: `Виджет «${id}» не установлен. Откройте Настройки → Виджеты.`,
          })
        );
        continue;
      }
      let config = {};
      if (node.dataset.widgetConfig) {
        try {
          config = JSON.parse(node.dataset.widgetConfig);
        } catch {
          config = {};
        }
      }
      const body = h('div', { class: 'widget-card-body' });
      const card = h(
        'section',
        { class: 'widget-card' },
        h(
          'div',
          { class: 'widget-card-head' },
          h('span', { class: 'w-icon', text: def.icon }),
          h('span', { class: 'w-name', text: def.name }),
          h('span', { class: 'w-badge', text: 'встроен' })
        ),
        body
      );
      node.appendChild(card);
      inlineCleanups.push(mountWidget(def, body, { surface: 'inline', config }));
    }
  };

  // Клики внутри предпросмотра
  contentEl.addEventListener('click', async (event) => {
    const external = event.target.closest('a[data-external]');
    if (external) {
      event.preventDefault();
      api.app.openExternal(external.getAttribute('href')).catch(() => {});
      return;
    }
    const wiki = event.target.closest('a[data-wiki]');
    if (wiki) {
      event.preventDefault();
      const title = wiki.dataset.wiki;
      const target = state.vault.notes.find(
        (note) =>
          !note.deletedAt && note.title.trim().toLowerCase() === title.trim().toLowerCase()
      );
      if (target) {
        selectNote(target.id).catch(notifyError);
      } else {
        toast(`Заметка «${title}» не найдена`, 'warn');
      }
      return;
    }
    const link = event.target.closest('a[href]');
    if (link && !link.getAttribute('href').startsWith('#')) {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (/^(https?:|mailto:)/i.test(href)) api.app.openExternal(href).catch(() => {});
    }
  });

  contentEl.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input.task-checkbox[data-line]');
    if (!checkbox) return;
    const note = activeNote();
    if (!note) return;
    const line = Number(checkbox.dataset.line);
    const lines = note.body.split('\n');
    if (!lines[line]) return;
    lines[line] = lines[line].replace(
      /^(\s*(?:[-*+]|\d+\.)\s+\[)[ xX](\])/,
      checkbox.checked ? '$1x$2' : '$1 $2'
    );
    emit('editor:replace-body', { body: lines.join('\n') });
  });

  on('preview:goto-heading', ({ line }) => {
    if (state.rightTab !== 'preview') setTab('preview');
    setTimeout(() => {
      const heading = contentEl.querySelector(`#md-h-${Number(line)}`);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        heading.classList.add('highlight-flash');
        setTimeout(() => heading.classList.remove('highlight-flash'), 1300);
      }
    }, 40);
  });

  // ---------- Виджеты ----------
  const cleanupWidgets = () => {
    for (const fn of widgetCleanups) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    widgetCleanups = [];
  };

  const buildWidgetCard = (def) => {
    const isCollapsed = collapsed.has(def.id);
    const body = h('div', { class: 'widget-card-body' });
    const collapseBtn = h(
      'button',
      {
        class: 'w-collapse',
        title: isCollapsed ? 'Развернуть' : 'Свернуть',
        'aria-label': 'Свернуть виджет',
        onClick: () => {
          if (collapsed.has(def.id)) collapsed.delete(def.id);
          else collapsed.add(def.id);
          card.classList.toggle('collapsed');
        },
      },
      icon('chevronDown')
    );
    const card = h(
      'section',
      { class: `widget-card${isCollapsed ? ' collapsed' : ''}` },
      h(
        'div',
        { class: 'widget-card-head' },
        h('span', { class: 'w-icon', text: def.icon }),
        h('span', { class: 'w-name', text: def.name }),
        def.user ? h('span', { class: 'w-badge', text: 'свой' }) : null,
        collapseBtn
      ),
      body
    );
    widgetCleanups.push(mountWidget(def, body, { surface: 'panel' }));
    return card;
  };

  const renderWidgets = (force = false) => {
    const enabled = state.settings?.widgets?.enabled || [];
    const signature = JSON.stringify([enabled, state.userWidgets.map((w) => w.id)]);
    if (!force && signature === lastWidgetSignature) return;
    lastWidgetSignature = signature;
    cleanupWidgets();
    clear(widgetsEl);

    const toolbarEl = h(
      'div',
      { class: 'widgets-toolbar' },
      h('span', { class: 'title', text: `Виджеты · ${enabled.length}` }),
      h(
        'button',
        {
          class: 'btn icon-only',
          title: 'Создать виджет с AI',
          onClick: () => emit('ui:widget-studio'),
        },
        icon('sparkle')
      ),
      h(
        'button',
        {
          class: 'btn icon-only',
          title: 'Вставить виджет в заметку',
          onClick: (event) => {
            const items = listWidgets().map((widget) => ({
              icon: 'grid',
              label: widget.name,
              onClick: () => {
                emit('editor:insert', {
                  text: `\n\n::widget[${widget.id}]\n\n`,
                  mode: 'end',
                });
                toast('Виджет встроен в конец заметки');
              },
            }));
            if (!items.length) {
              toast('Нет доступных виджетов', 'warn');
              return;
            }
            showDropdown(event.currentTarget, items.slice(0, 15));
          },
        },
        icon('plus')
      ),
    );
    widgetsEl.appendChild(toolbarEl);

    let count = 0;
    for (const id of enabled) {
      const def = getWidget(id);
      if (!def) continue;
      widgetsEl.appendChild(buildWidgetCard(def));
      count += 1;
    }

    for (const error of state.widgetErrors) {
      widgetsEl.appendChild(
        h(
          'div',
          { class: 'widget-error', style: { marginBottom: '8px' } },
          h('strong', { text: `Не удалось загрузить ${error.fileId}.js` }),
          h('div', { text: error.message })
        )
      );
    }

    if (!count) {
      widgetsEl.appendChild(
        h(
          'div',
          { class: 'widgets-empty' },
          icon('widgets'),
          h('div', { text: 'Все виджеты выключены' }),
          h(
            'button',
            {
              class: 'btn ghost small',
              style: { marginTop: '9px' },
              onClick: () => emit('ui:open-settings', { tab: 'widgets' }),
            },
            'Выбрать виджеты'
          )
        )
      );
    }
  };

  on('widgets:changed', () => {
    renderWidgets(true);
    renderPreview();
  });
  on('themes:changed', () => {
    renderWidgets(true);
    renderPreview();
  });

  // ---------- События ----------
  on('note:selected', () => {
    renderPreview();
    updateToolbar();
  });
  on('note:changed', (note) => {
    if (note?.id !== state.vault.activeNoteId) return;
    updateToolbar();
    schedulePreview();
  });
  on('vault:changed', () => {
    updateToolbar();
    schedulePreview();
    if (state.rightTab === 'widgets') renderWidgets(true);
  });
  on('settings:changed', (settings) => {
    const prev = previousSettings;
    previousSettings = settings;
    if (settings.editor.livePreview !== prev?.editor.livePreview) renderPreview();
    if (state.rightTab === 'preview') {
      // тема и шрифты применяются через CSS, перерисовка не нужна
      updateToolbar();
    }
    if (
      JSON.stringify(settings.widgets.enabled) !==
      JSON.stringify(prev?.widgets.enabled)
    ) {
      renderWidgets(true);
    }
    if (settings.layout.rightTab !== state.rightTab && !panelEl.classList.contains('open')) {
      state.rightTab = settings.layout.rightTab;
      syncTabs();
      previewEl.hidden = state.rightTab !== 'preview';
      widgetsEl.hidden = state.rightTab !== 'widgets';
    }
  });

  on('ui:open-widgets', () => setTab('widgets'));

  renderTabs();
  previewEl.hidden = state.rightTab !== 'preview';
  widgetsEl.hidden = state.rightTab !== 'widgets';
  renderPreview();
  renderWidgets(true);
  emit('ui:right-changed', { tab: state.rightTab, open: true });
}
