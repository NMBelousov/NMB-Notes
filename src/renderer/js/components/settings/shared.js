import { h } from '../../dom.js';
import { icon } from '../../icons.js';

export function section(title, ...children) {
  return h(
    'section',
    { class: 'settings-section' },
    title ? h('h3', { text: title }) : null,
    ...children
  );
}

export function note(content, type = '') {
  const el = h('div', { class: `settings-note ${type}` });
  if (content instanceof Node) el.appendChild(content);
  else el.textContent = String(content);
  return el;
}

export function field(label, desc, control, options = {}) {
  return h(
    'div',
    { class: 'field' },
    h(
      'div',
      { class: 'field-info' },
      h('span', { class: 'field-label', text: label }),
      desc ? h('span', { class: 'field-desc', text: desc }) : null
    ),
    h(
      'div',
      { class: `field-control${options.wide ? ' wide' : ''}` },
      control
    )
  );
}

export function toggleRow(label, desc, value, onChange) {
  const toggle = h('button', {
    class: `toggle${value ? ' on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': value ? 'true' : 'false',
    'aria-label': label,
    onClick: () => {
      const next = !toggle.classList.contains('on');
      toggle.classList.toggle('on', next);
      toggle.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
    },
  });
  return field(label, desc, toggle);
}

export function rangeRow({
  label,
  desc,
  min = 0,
  max = 100,
  step = 1,
  value = 0,
  suffix = '',
  onChange,
  format = (val) => String(val),
}) {
  const valueEl = h('span', { class: 'range-value', text: format(value) });
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    onInput: (event) => {
      valueEl.textContent = format(Number(event.target.value));
    },
    onChange: (event) => onChange(Number(event.target.value)),
  });
  return field(
    label,
    desc,
    h(
      'div',
      { class: 'range-row' },
      input,
      valueEl,
      suffix ? h('span', { class: 'unit', text: suffix }) : null
    )
  );
}

export function textRow({
  label,
  desc,
  value = '',
  type = 'text',
  placeholder = '',
  onChange,
  wide = true,
}) {
  const input = h('input', {
    class: 'input',
    type,
    value,
    placeholder,
    onChange: (event) => onChange(event.target.value),
    onKeydown: (event) => {
      if (event.key === 'Enter') event.target.blur();
    },
  });
  return field(label, desc, input, { wide });
}

export function button(label, onClick, options = {}) {
  const btn = h(
    'button',
    {
      class: `btn ${options.variant || 'ghost'} ${options.small ? 'small' : ''}`,
      type: 'button',
      onClick,
    },
    options.icon ? icon(options.icon) : null,
    h('span', { text: label })
  );
  if (options.disabled) btn.disabled = true;
  return btn;
}

export function actionsRow(...buttons) {
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } }, ...buttons);
}

export function statBox(value, label) {
  return h(
    'div',
    { class: 'stat-box' },
    h('div', { class: 'value', text: String(value) }),
    h('div', { class: 'label', text: label })
  );
}

export function keyValueRows(rows) {
  return h(
    'div',
    { class: 'shortcut-grid' },
    ...rows.flatMap(([label, value]) => [
      h('b', { text: label }),
      h('span', { text: value, style: { textAlign: 'right' } }),
    ])
  );
}
