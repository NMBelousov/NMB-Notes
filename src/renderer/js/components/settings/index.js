import { h, clear } from '../../dom.js';
import { icon } from '../../icons.js';
import { state, on, emit, refreshKeyStatus, refreshThemes } from '../../state.js';
import { renderAppearance } from './appearance.js';
import { renderAiSettings } from './ai.js';
import { renderWidgetsSettings } from './widgets.js';
import { renderEditorSettings } from './editor.js';
import { renderDataSettings } from './data.js';
import { renderUpdates } from './updates.js';
import { renderAbout } from './about.js';
import { openWidgetStudio, openWidgetGuide } from './widgetStudio.js';
import { reloadWidgets } from '../../widgets/registry.js';

const api = window.api;

const TABS = [
  { id: 'appearance', label: 'Вид', icon: 'palette', render: renderAppearance },
  { id: 'ai', label: 'AI', icon: 'ai', render: renderAiSettings },
  { id: 'widgets', label: 'Виджеты', icon: 'widgets', render: renderWidgetsSettings },
  { id: 'editor', label: 'Редактор', icon: 'edit', render: renderEditorSettings },
  { id: 'data', label: 'Данные', icon: 'database', render: renderDataSettings },
  { id: 'updates', label: 'Обновления', icon: 'download', render: renderUpdates },
  { id: 'about', label: 'О приложении', icon: 'info', render: renderAbout },
];

export function mountSettings(panel) {
  let activeTab = TABS.some((tab) => tab.id === state.settingsTab)
    ? state.settingsTab
    : 'appearance';

  const titleVersion = h('span', {
    class: 'badge-soft',
    text: state.info ? `v${state.info.version}` : '',
  });
  const closeBtn = h(
    'button',
    {
      class: 'btn icon-only',
      title: 'Закрыть (Esc)',
      'aria-label': 'Закрыть настройки',
      onClick: () => close(),
    },
    icon('close')
  );
  const head = h(
    'div',
    { class: 'settings-head' },
    h('h2', { text: 'Настройки' }),
    titleVersion,
    closeBtn
  );

  const tabsEl = h('div', { class: 'settings-tabs' });
  const body = h('div', { class: 'settings-body' });
  clear(panel);
  panel.append(head, tabsEl, body);

  const renderTabs = () => {
    clear(tabsEl);
    for (const tab of TABS) {
      tabsEl.appendChild(
        h(
          'button',
          {
            class: `settings-tab${tab.id === activeTab ? ' active' : ''}`,
            type: 'button',
            onClick: () => selectTab(tab.id),
          },
          icon(tab.icon),
          h('span', { text: tab.label })
        )
      );
    }
  };

  const renderTab = () => {
    const tab = TABS.find((entry) => entry.id === activeTab) || TABS[0];
    clear(body);
    try {
      body.appendChild(
        tab.render({
          refresh: () => renderTab(),
          close,
          openTab: selectTab,
        })
      );
    } catch (error) {
      console.error('[settings]', error);
      body.appendChild(
        h('div', { class: 'settings-note danger', text: `Ошибка раздела: ${error.message}` })
      );
    }
    body.scrollTop = 0;
  };

  const selectTab = (id) => {
    if (!TABS.some((tab) => tab.id === id)) return;
    activeTab = id;
    state.settingsTab = id;
    renderTabs();
    renderTab();
  };

  const open = async ({ tab = activeTab } = {}) => {
    activeTab = TABS.some((entry) => entry.id === tab) ? tab : activeTab;
    state.settingsTab = activeTab;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    emit('ai:close');
    emit('settings:state', { open: true, tab: activeTab });
    renderTabs();
    renderTab();
    refreshKeyStatus().then((status) => {
      if (activeTab === 'ai') {
        void status;
        renderTab();
      }
    }).catch(() => {});
    if (activeTab === 'appearance') {
      refreshThemes().then(() => {
        if (activeTab === 'appearance') renderTab();
      }).catch(() => {});
    }
    if (activeTab === 'widgets') {
      reloadWidgets().then(() => {
        if (activeTab === 'widgets') renderTab();
      }).catch(() => {});
    }
  };

  const close = () => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    emit('settings:state', { open: false });
  };

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  });

  on('ui:open-settings', (payload) => open(payload || {}));
  on('settings:close', close);
  on('ui:widget-studio', () => {
    openWidgetStudio(() => {
      if (activeTab === 'widgets') renderTab();
    });
  });
  on('ui:open-widget-guide', () => openWidgetGuide());
  on('themes:changed', () => {
    if (activeTab === 'appearance') renderTab();
  });

  renderTabs();
  renderTab();
}
