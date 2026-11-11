import { h } from '../dom.js';
import { toast } from '../toast.js';
import {
  state,
  activeNote,
  emit,
  on,
  selectNote,
} from '../state.js';
import { renderMarkdown, stripMarkdown } from '../markdown.js';

const api = window.api;

const widgets = new Map();
const loadErrors = [];

function validateDefinition(def) {
  if (!def || typeof def !== 'object') throw new Error('Нет объекта виджета');
  if (typeof def.id !== 'string' || !/^[a-z0-9][a-z0-9-_]{0,48}$/.test(def.id)) {
    throw new Error('Некорректный id виджета');
  }
  if (typeof def.render !== 'function') throw new Error('Не хватает функции render()');
  if (typeof def.name !== 'string' || !def.name.trim()) {
    throw new Error('Не хватает названия виджета');
  }
}

export function registerWidget(def, { user = false } = {}) {
  validateDefinition(def);
  if (user && widgets.has(def.id) && !widgets.get(def.id).user) {
    throw new Error(`Виджет с id «${def.id}» уже существует`);
  }
  widgets.set(def.id, {
    id: def.id,
    name: def.name.trim().slice(0, 80),
    description:
      typeof def.description === 'string' ? def.description.slice(0, 300) : '',
    icon: typeof def.icon === 'string' ? def.icon.slice(0, 8) : '🧩',
    version: typeof def.version === 'string' ? def.version.slice(0, 20) : '1.0.0',
    render: def.render,
    user: Boolean(user),
  });
  return widgets.get(def.id);
}

export function unregisterUserWidgets() {
  for (const [id, def] of widgets) {
    if (def.user) widgets.delete(id);
  }
}

export function getWidget(id) {
  return widgets.get(id) || null;
}

export function listWidgets() {
  return Array.from(widgets.values());
}

export function widgetErrors() {
  return loadErrors.slice();
}

export function clearWidgetErrors() {
  loadErrors.length = 0;
}

export async function loadUserWidgets() {
  unregisterUserWidgets();
  clearWidgetErrors();
  const files = await api.widgets.list();
  state.userWidgets = [];
  for (const file of files) {
    let url = null;
    try {
      const blob = new Blob([file.source], { type: 'text/javascript' });
      url = URL.createObjectURL(blob);
      const module = await import(url);
      const def = module.default;
      validateDefinition(def);
      registerWidget(def, { user: true });
      state.userWidgets.push({
        id: def.id,
        fileId: file.id,
        name: def.name,
        description: def.description || '',
        icon: def.icon || '🧩',
        version: def.version || '1.0.0',
        updatedAt: file.updatedAt,
      });
    } catch (error) {
      console.error(`[widgets] ${file.id}:`, error);
      loadErrors.push({
        fileId: file.id,
        message: String(error?.message || error),
      });
      state.widgetErrors = loadErrors.slice();
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  emit('widgets:changed');
  return state.userWidgets;
}

export async function reloadWidgets() {
  await loadUserWidgets();
  emit('widgets:changed');
}

export function createWidgetStorage(id) {
  const prefix = `nmb-widget:${id}:`;
  return {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(prefix + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    delete(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function createWidgetContext(id, surface = 'panel', config = {}) {
  return {
    id,
    surface,
    config: config || {},
    getNote: () => activeNote(),
    getNotes: () => state.vault.notes.filter((note) => !note.deletedAt),
    getFolders: () => state.vault.folders.slice(),
    getSettings: () => state.settings,
    getTheme: () => state.settings?.theme,
    getAppVersion: () => state.info?.version || '',
    insertText(text, options = {}) {
      emit('editor:insert', {
        text: String(text || ''),
        mode: options.mode === 'end' ? 'end' : 'cursor',
      });
    },
    replaceSelection(text) {
      emit('editor:replace-selection', { text: String(text || '') });
    },
    setSearch(query) {
      emit('ui:search', { query: String(query || '') });
    },
    openNote(noteId) {
      selectNote(noteId).catch(() => {});
    },
    openSettings(tab = 'appearance') {
      emit('ui:open-settings', { tab });
    },
    openAI(prompt = '') {
      emit('ai:open', { prompt });
    },
    focusHeading(line) {
      emit('preview:goto-heading', { line });
    },
    focusEditorLine(line) {
      emit('editor:goto-line', { line });
    },
    notify(message, type = 'success') {
      toast(message, type);
    },
    on(event, handler) {
      return on(event, handler);
    },
    storage: createWidgetStorage(id),
    markdown: { render: renderMarkdown, plain: stripMarkdown },
    el: h,
    api,
    async askAI(prompt, options = {}) {
      if (!state.aiKeyStatus?.set) {
        throw new Error('Добавьте API-ключ DeepSeek в настройках AI');
      }
      const messages = [
        {
          role: 'system',
          content:
            options.system ||
            'Ты — AI-ассистент внутри приложения для заметок. Отвечай кратко и по делу, на языке пользователя, в формате Markdown. Не добавляй вступлений вроде «Конечно!».',
        },
      ];
      const note = options.includeContext === false ? null : activeNote();
      if (note) {
        messages.push({
          role: 'system',
          content: `Текущая заметка «${note.title}»:\n\n${note.body.slice(0, 12000)}`,
        });
      }
      messages.push({ role: 'user', content: String(prompt) });
      const result = await api.ai.chat({
        messages,
        options: {
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        },
      });
      return result.text;
    },
  };
}

export function mountWidget(def, container, { surface = 'panel', config = {} } = {}) {
  container.textContent = '';
  try {
    const ctx = createWidgetContext(def.id, surface, config);
    const cleanup = def.render(container, ctx);
    return typeof cleanup === 'function' ? cleanup : () => {};
  } catch (error) {
    console.error(`[widget:${def.id}]`, error);
    container.appendChild(
      h('div', {
        class: 'widget-error',
        text: `Ошибка виджета: ${error?.message || error}`,
      })
    );
    return () => {};
  }
}

/* ---------- Встроенные виджеты ---------- */

import statsWidget from './builtin/stats.js';
import outlineWidget from './builtin/outline.js';
import quickActionsWidget from './builtin/quick-actions.js';
import tagsWidget from './builtin/tags.js';
import relatedWidget from './builtin/related.js';
import focusTimerWidget from './builtin/focus-timer.js';

export function registerBuiltinWidgets() {
  for (const def of [
    statsWidget,
    outlineWidget,
    quickActionsWidget,
    tagsWidget,
    relatedWidget,
    focusTimerWidget,
  ]) {
    registerWidget(def);
  }
}
