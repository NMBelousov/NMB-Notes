import { h } from './dom.js';
import { icon } from './icons.js';

const root = () => document.getElementById('toast-root');

export function cleanErrorMessage(error) {
  const raw =
    typeof error === 'string'
      ? error
      : error?.message || String(error ?? 'Произошла ошибка');
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

export function toast(message, type = 'success', timeout = 2600) {
  const container = root();
  if (!container) return;
  const iconName = type === 'error' ? 'warning' : type === 'warn' ? 'warning' : 'check';
  const el = h(
    'div',
    { class: `toast ${type}` },
    icon(iconName),
    h('span', { text: String(message) })
  );
  container.appendChild(el);
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 180);
  };
  setTimeout(remove, timeout);
  el.addEventListener('click', remove);
  while (container.children.length > 4) container.firstElementChild.remove();
}

export const notifyError = (error) =>
  toast(cleanErrorMessage(error), 'error', 4200);
