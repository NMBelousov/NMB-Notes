import { h, clear, debounce } from '../../dom.js';
import { extractOutline } from '../../markdown.js';

export default {
  id: 'outline',
  name: 'Оглавление',
  description: 'Навигация по заголовкам заметки',
  icon: '📑',
  version: '1.0.0',
  render(container, ctx) {
    const list = h('div', { class: 'w-outline' });
    container.appendChild(list);

    const render = () => {
      clear(list);
      const note = ctx.getNote();
      const headings = note ? extractOutline(note.body) : [];
      if (!headings.length) {
        list.appendChild(
          h('div', {
            class: 'w-empty',
            text: 'Добавьте заголовки через # — они появятся здесь.',
          })
        );
        return;
      }
      for (const heading of headings) {
        list.appendChild(
          h(
            'button',
            {
              class: `l${heading.level}`,
              title: heading.text,
              onClick: () => ctx.focusHeading(heading.line),
            },
            heading.text
          )
        );
      }
    };

    render();
    const debounced = debounce(render, 160);
    const off = ctx.on('note:changed', debounced);
    const offSelected = ctx.on('note:selected', debounced);
    return () => {
      debounced.cancel();
      off();
      offSelected();
    };
  },
};
