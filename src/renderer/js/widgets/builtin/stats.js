import { h, countWords, readingTime } from '../../dom.js';
import { countTasks } from '../../markdown.js';

export default {
  id: 'stats',
  name: 'Статистика заметки',
  description: 'Слова, символы, время чтения и прогресс задач',
  icon: '📊',
  version: '1.0.0',
  render(container, ctx) {
    const wordsEl = h('span', { class: 'v' });
    const charsEl = h('span', { class: 'v' });
    const timeEl = h('span', { class: 'v' });
    const tasksEl = h('span', { class: 'v' });
    const footText = h('span');
    const footRight = h('span');
    const progress = h('i');

    container.appendChild(
      h(
        'div',
        { class: 'w-stats' },
        h('div', { class: 'w-stat' }, wordsEl, h('span', { class: 'l', text: 'слов' })),
        h('div', { class: 'w-stat' }, charsEl, h('span', { class: 'l', text: 'символов' })),
        h('div', { class: 'w-stat' }, timeEl, h('span', { class: 'l', text: 'мин' })),
        h('div', { class: 'w-stat' }, tasksEl, h('span', { class: 'l', text: 'задачи' }))
      ),
      h('div', { class: 'w-progress' }, progress),
      h('div', { class: 'w-foot' }, footText, footRight)
    );

    const update = () => {
      const note = ctx.getNote();
      const body = note?.body || '';
      const words = countWords(body);
      const tasks = countTasks(body);
      wordsEl.textContent = String(words);
      charsEl.textContent = words ? String(body.replace(/\s/g, '').length) : '0';
      timeEl.textContent = String(readingTime(body));
      tasksEl.textContent = tasks.total ? `${tasks.done}/${tasks.total}` : '0';
      const ratio = tasks.total ? (tasks.done / tasks.total) * 100 : 0;
      progress.style.width = `${ratio}%`;
      footText.textContent = tasks.total
        ? `Выполнено ${Math.round(ratio)}% задач`
        : note
          ? 'Заметка сохранена локально'
          : 'Нет активной заметки';
      footRight.textContent = `${body.split('\n').length} строк`;
    };

    update();
    const off = ctx.on('note:changed', update);
    const offSelected = ctx.on('note:selected', update);
    return () => {
      off();
      offSelected();
    };
  },
};
