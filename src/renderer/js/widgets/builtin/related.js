import { h, clear, debounce } from '../../dom.js';
import { icon } from '../../icons.js';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  id: 'related',
  name: 'Связанные заметки',
  description: 'Обратные и исходящие ссылки [[...]]',
  icon: '🔗',
  version: '1.0.0',
  render(container, ctx) {
    const list = h('div', { class: 'w-related' });
    container.appendChild(list);

    const render = () => {
      clear(list);
      const note = ctx.getNote();
      if (!note) {
        list.appendChild(h('div', { class: 'w-empty', text: 'Нет активной заметки.' }));
        return;
      }
      const notes = ctx.getNotes();
      const incoming = [];
      const outgoing = new Map();

      const outgoingRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let match;
      while ((match = outgoingRegex.exec(note.body)) !== null) {
        const title = match[1].trim().toLowerCase();
        const target = notes.find(
          (candidate) =>
            candidate.id !== note.id && candidate.title.toLowerCase() === title
        );
        if (target) outgoing.set(target.id, target);
      }

      if (note.title.trim()) {
        const escaped = escapeRegex(note.title.trim());
        const backlinkRegex = new RegExp(`\\[\\[\\s*${escaped}\\s*(\\||\\]\\])`, 'i');
        for (const candidate of notes) {
          if (candidate.id === note.id) continue;
          if (backlinkRegex.test(candidate.body)) incoming.push(candidate);
        }
      }

      const seen = new Set();
      const items = [
        ...incoming.map((item) => ({ note: item, direction: '←' })),
        ...Array.from(outgoing.values()).map((item) => ({ note: item, direction: '→' })),
      ].filter((item) => {
        if (seen.has(item.note.id)) return false;
        seen.add(item.note.id);
        return true;
      });

      if (!items.length) {
        list.appendChild(
          h('div', {
            class: 'w-empty',
            text: 'Ссылок пока нет. Используйте [[Название заметки]], чтобы связать заметки.',
          })
        );
        return;
      }

      for (const item of items) {
        list.appendChild(
          h(
            'button',
            {
              onClick: () => ctx.openNote(item.note.id),
              title: item.note.title,
            },
            icon('file'),
            h('span', { class: 'rt', text: item.note.title }),
            h('span', { class: 'rd', text: item.direction })
          )
        );
      }
    };

    render();
    const debounced = debounce(render, 240);
    const off = ctx.on('note:changed', debounced);
    const offSelected = ctx.on('note:selected', debounced);
    const offVault = ctx.on('vault:changed', debounced);
    return () => {
      debounced.cancel();
      off();
      offSelected();
      offVault();
    };
  },
};
