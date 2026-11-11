/** Небольшие DOM-утилиты. Никаких зависимостей — только браузерные API. */

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

const PROP_ALIASES = {
  className: 'class',
};

/**
 * Создаёт элемент.
 * h('div', { class: 'x', onClick: fn, dataset: { id: 1 } }, 'text', childNode)
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props && typeof props === 'object') {
    for (const [rawKey, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      const key = PROP_ALIASES[rawKey] || rawKey;
      if (key === 'class') {
        el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      } else if (key === 'style' && typeof value === 'object') {
        for (const [prop, val] of Object.entries(value)) {
          if (val !== undefined && val !== null) el.style.setProperty(
            prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
            String(val)
          );
        }
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [dataKey, val] of Object.entries(value)) {
          if (val !== undefined && val !== null) el.dataset[dataKey] = String(val);
        }
      } else if (key === 'html') {
        el.innerHTML = String(value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replace(el, ...children) {
  clear(el);
  appendChildren(el, children);
  return el;
}

export function svgIcon(markup, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = markup;
  return span;
}

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function formatDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return 'Вчера';
  const days = Math.round((now - date) / 86400000);
  if (days >= 0 && days < 7) {
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

export function countWords(text) {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

export function readingTime(text) {
  const words = countWords(text);
  return Math.max(1, Math.round(words / 200));
}

export function isMac() {
  return navigator.platform.toLowerCase().includes('mac');
}

export function modKey() {
  return isMac() ? '⌘' : 'Ctrl';
}

export function on(root, type, selector, handler) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
