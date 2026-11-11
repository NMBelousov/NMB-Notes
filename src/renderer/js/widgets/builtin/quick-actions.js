import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { state } from '../../state.js';

const ACTIONS = [
  {
    id: 'summary',
    label: 'Сделать резюме',
    icon: 'book',
    prompt:
      'Сделай краткое резюме этой заметки: 3–6 ключевых пунктов. Верни только готовый Markdown без вступлений.',
    title: '## Резюме',
    mode: 'end',
  },
  {
    id: 'tasks',
    label: 'Собрать задачи',
    icon: 'check',
    prompt:
      'Выдели из заметки конкретные задачи и верни их чек-листом Markdown: "- [ ] задача". Если задач нет, предложи 3 логичных следующих шага.',
    title: '## Задачи',
    mode: 'end',
  },
  {
    id: 'continue',
    label: 'Продолжить',
    icon: 'arrowRight',
    prompt:
      'Продолжи текст этой заметки на 1–2 абзаца в том же стиле. Верни только продолжение, без повторения уже написанного.',
    title: '',
    mode: 'end',
  },
  {
    id: 'improve',
    label: 'Улучшить',
    icon: 'spark',
    prompt:
      'Помоги улучшить текст этой заметки: предложи более ясную структуру, формулировки и убирай лишнее. Сначала покажи план правок.',
    title: '',
    mode: 'panel',
  },
];

export default {
  id: 'quick-actions',
  name: 'Быстрые действия AI',
  description: 'Резюме, задачи и продолжение текста в один клик',
  icon: '⚡',
  version: '1.0.0',
  render(container, ctx) {
    const grid = h('div', { class: 'w-actions' });
    container.appendChild(grid);

    const buttons = ACTIONS.map((action) => {
      const button = h(
        'button',
        {
          class: 'w-action',
          type: 'button',
          title: action.prompt,
          onClick: async () => {
            if (button.disabled) return;
            if (action.mode === 'panel') {
              ctx.openAI(action.prompt);
              return;
            }
            if (!state.aiKeyStatus?.set) {
              ctx.notify('Сначала добавьте API-ключ DeepSeek в настройках AI', 'warn');
              ctx.openSettings('ai');
              return;
            }
            button.disabled = true;
            button.classList.add('loading');
            try {
              const text = await ctx.askAI(action.prompt);
              const prefix = action.title ? `\n\n${action.title}\n\n` : '\n\n';
              ctx.insertText(`${prefix}${text.trim()}\n`, { mode: 'end' });
              ctx.notify('Готово — результат добавлен в заметку');
            } catch (error) {
              ctx.notify(error?.message || 'Ошибка AI', 'error');
            } finally {
              button.disabled = false;
              button.classList.remove('loading');
            }
          },
        },
        icon(action.icon),
        h('span', { text: action.label })
      );
      return button;
    });
    grid.append(...buttons);

    const updateAvailability = () => {
      const hasNote = Boolean(ctx.getNote());
      for (const button of buttons) button.disabled = !hasNote;
    };
    updateAvailability();
    const off = ctx.on('note:selected', updateAvailability);
    return () => off();
  },
};
