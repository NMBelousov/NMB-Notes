import { h, clear } from './dom.js';
import { icon } from './icons.js';

let activeModal = null;

export function openModal({
  title = '',
  body = null,
  footer = null,
  wide = false,
  dismissible = true,
  onClose = null,
  headExtra = null,
} = {}) {
  const root = document.getElementById('modal-root');
  const dialog = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const head = h(
    'div',
    { class: 'modal-head' },
    h('h2', { text: title }),
    headExtra,
    h(
      'button',
      {
        class: 'btn icon-only',
        title: 'Закрыть',
        'aria-label': 'Закрыть',
        onClick: () => close(null),
      },
      icon('close')
    )
  );
  const bodyWrap = h('div', { class: 'modal-body' });
  if (body) {
    if (body instanceof Node) bodyWrap.appendChild(body);
    else bodyWrap.appendChild(h('div', { text: String(body) }));
  }
  dialog.appendChild(head);
  dialog.appendChild(bodyWrap);
  if (footer) dialog.appendChild(footer);

  const overlay = h('div', {
    class: 'modal-overlay',
    onMousedown: (event) => {
      if (dismissible && event.target === overlay) close(null);
    },
  });
  overlay.appendChild(dialog);

  const onKey = (event) => {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      close(null);
    }
  };
  document.addEventListener('keydown', onKey, true);

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (activeModal?.overlay === overlay) activeModal = null;
    if (typeof onClose === 'function') onClose(result);
  }

  root.appendChild(overlay);
  activeModal = { overlay, dialog, close };

  requestAnimationFrame(() => {
    const focusable = dialog.querySelector(
      'input:not([type="hidden"]), textarea, select, button.primary, button'
    );
    if (focusable) focusable.focus();
  });

  return { overlay, dialog, body: bodyWrap, close, setFooter: (node) => {
    const existing = dialog.querySelector('.modal-foot');
    if (existing) existing.remove();
    if (node) dialog.appendChild(node);
  }};
}

export function closeActiveModal(result = null) {
  activeModal?.close(result);
}

export function confirmDialog({
  title = 'Подтверждение',
  message = '',
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(Boolean(value));
    };
    const modal = openModal({
      title,
      body: h('p', { text: message }),
      onClose: () => finish(false),
      footer: h(
        'div',
        { class: 'modal-foot' },
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', onClick: () => modal.close(false) }, cancelLabel),
        h(
          'button',
          {
            class: danger ? 'btn danger' : 'btn primary',
            onClick: () => {
              finish(true);
              modal.close(true);
            },
          },
          confirmLabel
        )
      ),
    });
  });
}

export function promptDialog({
  title = 'Введите значение',
  label = '',
  value = '',
  placeholder = '',
  confirmLabel = 'Сохранить',
  multiline = false,
} = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };
    const input = multiline
      ? h('textarea', { class: 'textarea', placeholder, rows: 5 })
      : h('input', { class: 'input', type: 'text', placeholder, value });
    if (multiline) input.value = value;
    const field = h(
      'div',
      { class: 'modal-field' },
      label ? h('label', { text: label }) : null,
      input
    );
    const submit = () => {
      const result = input.value.trim();
      finish(result || null);
      modal.close(result || null);
    };
    const modal = openModal({
      title,
      body: field,
      onClose: () => finish(null),
      footer: h(
        'div',
        { class: 'modal-foot' },
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', onClick: () => modal.close(null) }, 'Отмена'),
        h('button', { class: 'btn primary', onClick: submit }, confirmLabel)
      ),
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    });
    setTimeout(() => {
      input.focus();
      if (!multiline) input.select();
    }, 30);
  });
}

export function docModal({ title, html, wide = true }) {
  const body = h('div', { class: 'doc-body', html });
  return openModal({ title, body, wide });
}

export function replaceModalBody(modal, node) {
  if (!modal?.body) return;
  clear(modal.body);
  modal.body.appendChild(node);
}
