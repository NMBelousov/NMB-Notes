import { h, clear, debounce } from '../../dom.js';
import { extractTags } from '../../markdown.js';

export default {
  id: 'tags',
  name: 'Теги заметки',
  description: 'Теги вида #тег и быстрый поиск по ним',
  icon: '🏷️',
  version: '1.0.0',
  render(container, ctx) {
    const wrap = h('div', { class: 'w-tags' });
    container.appendChild(wrap);

    const render = () => {
      clear(wrap);
      const note = ctx.getNote();
      const tags = note ? extractTags(note.body) : [];
      if (!tags.length) {
        wrap.appendChild(
          h('div', {
            class: 'w-empty',
            text: 'Добавьте тег в текст заметки, например #идея или #работа.',
          })
        );
        return;
      }
      for (const tag of tags) {
        wrap.appendChild(
          h(
            'button',
            {
              class: 'w-tag',
              onClick: () => ctx.setSearch(`#${tag}`),
              title: `Найти заметки с тегом #${tag}`,
            },
            `#${tag}`
          )
        );
      }
    };

    render();
    const debounced = debounce(render, 220);
    const off = ctx.on('note:changed', debounced);
    const offSelected = ctx.on('note:selected', debounced);
    return () => {
      debounced.cancel();
      off();
      offSelected();
    };
  },
};
