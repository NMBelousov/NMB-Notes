import { h } from '../dom.js';
import { icon } from '../icons.js';

let active = null;

export function closeDropdown() {
  if (active) {
    active.remove();
    active = null;
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('resize', closeDropdown);
  }
}

function onPointerDown(event) {
  if (active && !active.contains(event.target)) closeDropdown();
}

export function showDropdown(anchor, items) {
  closeDropdown();
  const menu = h('div', { class: 'dropdown', role: 'menu' });
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      menu.appendChild(h('div', { class: 'dropdown-sep' }));
      continue;
    }
    menu.appendChild(
      h(
        'button',
        {
          class: `dropdown-item ${item.danger ? 'danger' : ''}`,
          type: 'button',
          role: 'menuitem',
          onClick: () => {
            closeDropdown();
            item.onClick?.();
          },
        },
        item.icon ? icon(item.icon) : null,
        h('span', { text: item.label }),
        item.shortcut ? h('span', { class: 'shortcut', text: item.shortcut }) : null
      )
    );
  }
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = rect.right - width;
  let top = rect.bottom + 6;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 6);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  active = menu;
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', closeDropdown);
  }, 0);
  return menu;
}

export function isDropdownOpen() {
  return Boolean(active);
}
