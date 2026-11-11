import { h, clear } from '../dom.js';
import { iconMarkup } from '../icons.js';
import { state, emit } from '../state.js';
import { listWidgets } from '../widgets/registry.js';

const BASE_ITEMS = [
  {
    group: 'Базовые блоки',
    id: 'h1',
    label: 'Заголовок 1',
    desc: 'Большой заголовок раздела',
    icon: 'H1',
    text: '# ',
  },
  {
    group: 'Базовые блоки',
    id: 'h2',
    label: 'Заголовок 2',
    desc: 'Средний заголовок',
    icon: 'H2',
    text: '## ',
  },
  {
    group: 'Базовые блоки',
    id: 'h3',
    label: 'Заголовок 3',
    desc: 'Небольшой подзаголовок',
    icon: 'H3',
    text: '### ',
  },
  {
    group: 'Базовые блоки',
    id: 'bullet',
    label: 'Маркированный список',
    desc: 'Список с точками',
    icon: '•',
    text: '- ',
  },
  {
    group: 'Базовые блоки',
    id: 'numbered',
    label: 'Нумерованный список',
    desc: 'Список с номерами',
    icon: '1.',
    text: '1. ',
  },
  {
    group: 'Базовые блоки',
    id: 'task',
    label: 'Чек-лист',
    desc: 'Задача с чекбоксом',
    icon: '☑',
    text: '- [ ] ',
  },
  {
    group: 'Базовые блоки',
    id: 'quote',
    label: 'Цитата',
    desc: 'Выделенная мысль',
    icon: '❝',
    text: '> ',
  },
  {
    group: 'Базовые блоки',
    id: 'code',
    label: 'Блок кода',
    desc: 'Моноширинный фрагмент',
    icon: '{}',
    text: '```\n\n```',
    caretOffset: 4,
  },
  {
    group: 'Базовые блоки',
    id: 'table',
    label: 'Таблица',
    desc: 'Таблица 3×2',
    icon: '▦',
    text: '| A | B | C |\n| --- | --- | --- |\n|  |  |  |',
    caretOffset: 23,
  },
  {
    group: 'Базовые блоки',
    id: 'divider',
    label: 'Разделитель',
    desc: 'Горизонтальная линия',
    icon: '—',
    text: '---\n',
  },
];

const AI_ITEMS = [
  {
    group: 'AI',
    id: 'ai-ask',
    label: 'AI-помощник',
    desc: 'Спросить что угодно',
    icon: '🤖',
    ai: true,
    prompt: '',
  },
  {
    group: 'AI',
    id: 'ai-summary',
    label: 'AI: резюме заметки',
    desc: 'Сжать содержание в тезисы',
    icon: '📝',
    ai: true,
    prompt:
      'Сделай краткое резюме этой заметки: 3–6 ключевых пунктов. Верни готовый Markdown.',
    autoSend: true,
    autoInsert: true,
  },
  {
    group: 'AI',
    id: 'ai-tasks',
    label: 'AI: план задач',
    desc: 'Собрать чек-лист из заметки',
    icon: '✓',
    ai: true,
    prompt:
      'Преврати содержание этой заметки в чек-лист конкретных задач. Верни только Markdown-список "- [ ] ...".',
    autoSend: true,
    autoInsert: true,
  },
  {
    group: 'AI',
    id: 'ai-continue',
    label: 'AI: продолжить текст',
    desc: 'Дописать в том же стиле',
    icon: '→',
    ai: true,
    prompt:
      'Продолжи текст этой заметки на 1–2 абзаца в том же стиле. Верни только продолжение.',
    autoSend: true,
    autoInsert: true,
  },
  {
    group: 'AI',
    id: 'ai-improve',
    label: 'AI: улучшить текст',
    desc: 'Структура и формулировки',
    icon: '✨',
    ai: true,
    prompt:
      'Помоги улучшить эту заметку: предложи структуру и более ясные формулировки.',
    autoSend: false,
  },
];

const STYLE_BY_GROUP = {
  AI: 'ai',
  Виджеты: 'widget',
};

export function createSlashMenu({ textarea, enabled }) {
  const menu = document.getElementById('slash-menu');
  let open = false;
  let start = -1;
  let selected = 0;
  let filtered = [];
  let widgetItems = [];

  const buildItems = () => {
    widgetItems = listWidgets()
      .slice(0, 12)
      .map((widget) => ({
        group: 'Виджеты',
        id: `widget-${widget.id}`,
        label: `Виджет: ${widget.name}`,
        desc: widget.description || 'Вставить виджет в заметку',
        icon: widget.icon || '🧩',
        widgetId: widget.id,
      }));
    return [...BASE_ITEMS, ...AI_ITEMS, ...widgetItems];
  };

  const allItems = () => buildItems();

  const render = () => {
    clear(menu);
    if (!filtered.length) {
      menu.appendChild(
        h('div', { class: 'slash-empty', text: 'Ничего не найдено' })
      );
      return;
    }
    let currentGroup = '';
    filtered.forEach((item, index) => {
      if (item.group !== currentGroup) {
        if (currentGroup) menu.appendChild(h('div', { class: 'slash-sep' }));
        menu.appendChild(h('div', { class: 'slash-head', text: item.group }));
        currentGroup = item.group;
      }
      const iconClass = `slash-icon ${STYLE_BY_GROUP[item.group] || ''}`;
      const iconNode =
        item.group === 'Виджеты'
          ? h('span', { class: iconClass, text: item.icon })
          : h('span', { class: iconClass, html: iconMarkupFromItem(item) });
      const button = h(
        'button',
        {
          class: `slash-item${index === selected ? ' selected' : ''}`,
          type: 'button',
          onMousemove: () => {
            if (selected === index) return;
            selected = index;
            updateSelection();
          },          onClick: () => apply(item),
        },
        iconNode,
        h(
          'span',
          { class: 'slash-text' },
          h('span', { class: 'slash-title', text: item.label }),
          h('span', { class: 'slash-desc', text: item.desc })
        )
      );
      button.dataset.index = String(index);
      menu.appendChild(button);
    });
  };

  const updateSelection = () => {
    for (const node of menu.querySelectorAll('.slash-item')) {
      node.classList.toggle('selected', Number(node.dataset.index) === selected);
    }
    menu.querySelector('.slash-item.selected')?.scrollIntoView({ block: 'nearest' });
  };

  const filter = (query) => {
    const q = query.toLowerCase().trim();
    const all = allItems();
    filtered = q
      ? all.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            item.id.includes(q)
        )
      : all;
    selected = 0;
    render();
  };

  const position = () => {
    const caret = getCaretCoordinates(textarea, Math.max(0, textarea.selectionStart));
    const rect = textarea.getBoundingClientRect();
    menu.hidden = false;
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    const width = menu.offsetWidth || 304;
    const height = menu.offsetHeight || 300;
    let left = rect.left + caret.left - textarea.scrollLeft;
    let top = rect.top + caret.top - textarea.scrollTop + 22;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top + caret.top - textarea.scrollTop - height - 6);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  };

  const show = (slashIndex) => {
    if (!enabled()) return;
    start = slashIndex;
    open = true;
    filtered = allItems();
    selected = 0;
    menu.hidden = false;
    render();
    position();
  };

  const close = () => {
    if (!open) return;
    open = false;
    menu.hidden = true;
    start = -1;
    filtered = [];
  };

  const handleInput = () => {
    if (!enabled()) {
      close();
      return;
    }
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    const match = line.match(/^\s*\/([^\s/]*)$/);
    if (!match) {
      close();
      return;
    }
    const slashIndex = lineStart + line.indexOf('/');
    if (!open || start !== slashIndex) show(slashIndex);
    filter(match[1]);
    position();
  };

  const handleKeydown = (event) => {
    if (!open) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selected = (selected + 1) % Math.max(1, filtered.length);
      updateSelection();
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selected = (selected - 1 + filtered.length) % Math.max(1, filtered.length);
      updateSelection();
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[selected]) apply(filtered[selected]);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return true;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (filtered[selected]) apply(filtered[selected]);
      return true;
    }
    return false;
  };

  const insertText = (text, caretOffset = 0) => {
    const pos = textarea.selectionStart;
    const value = textarea.value;
    const next = value.slice(0, start) + text + value.slice(pos);
    textarea.value = next;
    const caret = start + text.length + caretOffset;
    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.focus();
    close();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const apply = (item) => {
    if (!item) return;
    if (item.ai) {
      const pos = textarea.selectionStart;
      const value = textarea.value;
      textarea.value = value.slice(0, start) + value.slice(pos);
      textarea.selectionStart = textarea.selectionEnd = start;
      close();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      emit('ai:open', {
        prompt: item.prompt,
        autoSend: Boolean(item.autoSend),
        autoInsert: Boolean(item.autoInsert),
      });
      return;
    }
    if (item.widgetId) {
      insertText(`::widget[${item.widgetId}]`);
      return;
    }
    insertText(item.text || '', item.caretOffset || 0);
  };

  const onPointerDown = (event) => {
    if (!open) return;
    if (menu.contains(event.target) || event.target === textarea) return;
    close();
  };

  const onScroll = () => {
    if (open) position();
  };

  const onBlur = () => {
    setTimeout(() => {
      if (!menu.contains(document.activeElement)) close();
    }, 120);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  textarea.addEventListener('scroll', onScroll, { passive: true });
  textarea.addEventListener('blur', onBlur);

  return {
    handleInput,
    handleKeydown,
    close,
    isOpen: () => open,
    refresh: () => {
      if (open) {
        filter(textarea.value.slice(start + 1, textarea.selectionStart));
        position();
      }
    },
    destroy() {
      close();
      document.removeEventListener('pointerdown', onPointerDown, true);
      textarea.removeEventListener('scroll', onScroll);
      textarea.removeEventListener('blur', onBlur);
    },
  };
}

function iconMarkupFromItem(item) {
  if (item.ai) return iconMarkup('ai');
  return `<span style="font-size:12px">${item.icon}</span>`;
}

/** Координаты каретки внутри textarea через скрытое зеркало. */
function getCaretCoordinates(textarea, position) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const properties = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'textTransform',
    'wordSpacing',
    'lineHeight',
    'textIndent',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'tabSize',
  ];
  for (const property of properties) mirror.style[property] = style[property];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-99999px';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = textarea.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = textarea.value.substring(position, position + 1) || '.';
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const coordinates = {
    top: span.offsetTop,
    left: span.offsetLeft,
  };
  document.body.removeChild(mirror);
  return coordinates;
}
