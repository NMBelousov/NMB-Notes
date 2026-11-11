/** Краткое руководство, которое отправляется AI для генерации виджетов. */
export const WIDGET_GUIDE = `# NMB Notes — виджет

Виджет — это ES-модуль с \`export default\`. Он выполняется в изолированном renderer-процессе Electron (без Node.js).
Запрещены \`require\`, \`process\`, \`child_process\`, сетевые запросы и импорты других файлов. Только DOM и переданный ctx.

## Формат

\`\`\`js
export default {
  id: 'my-widget',            // только a-z, 0-9, дефис и _, до 49 символов
  name: 'Мой виджет',
  description: 'Что делает виджет',
  icon: '✨',
  version: '1.0.0',
  render(container, ctx) {
    // container — пустой HTMLElement
    // верните функцию cleanup, если используете таймеры или подписки
    const note = ctx.getNote();
    container.textContent = note?.title || 'Нет заметки';
    const off = ctx.on('note:changed', () => {
      container.textContent = ctx.getNote()?.title || '';
    });
    return () => off();
  },
};
\`\`\`

## Context API

- \`ctx.getNote()\` → { id, title, body, folderId, favorite, updatedAt } | null
- \`ctx.getNotes()\` → все неудалённые заметки
- \`ctx.getFolders()\` → папки
- \`ctx.getSettings()\` → настройки приложения
- \`ctx.getTheme()\` → id текущей темы
- \`ctx.insertText(text, { mode: 'cursor' | 'end' })\` — вставить в редактор
- \`ctx.replaceSelection(text)\` — заменить выделение
- \`ctx.setSearch(query)\` — задать поиск по заметкам
- \`ctx.openNote(id)\` — открыть заметку
- \`ctx.openSettings(tab)\` — открыть настройки: appearance | ai | widgets | editor | data | about
- \`ctx.openAI(prompt)\` — открыть AI-панель с запросом
- \`ctx.focusHeading(line)\` — прокрутить предпросмотр к заголовку
- \`ctx.focusEditorLine(line)\` — перейти к строке в редакторе
- \`ctx.notify(message, type)\` — тост: success | error | warn
- \`ctx.on(event, handler)\` → функция отписки. События: note:changed, note:selected, vault:changed, settings:changed, theme:applied, save:state
- \`ctx.storage.get(key, fallback)\`, \`ctx.storage.set(key, value)\`, \`ctx.storage.delete(key)\` — локальное хранилище виджета
- \`ctx.markdown.render(text)\` → безопасный HTML
- \`ctx.el(tag, props, ...children)\` — DOM-хелпер (как h)
- \`await ctx.askAI(prompt, { system?, includeContext? })\` → текст ответа DeepSeek
- \`ctx.api\` — мост Electron (window.api), используйте осторожно

## Правила

1. Не используйте innerHTML с пользовательскими данными — только textContent или ctx.el.
2. Всегда возвращайте cleanup для setInterval / setTimeout / ctx.on.
3. Не используйте глобальные переменные между экземплярами — состояние держите в замыкании.
4. CSS-классы используйте существующие (w-stat, w-empty, w-actions, btn, btn small, widget-error) либо inline-style.
5. Виджет должен корректно работать без активной заметки.
6. Не делайте fetch/XHR: сеть запрещена политикой безопасности. Для AI используйте ctx.askAI.
7. Ответ — ТОЛЬКО валидный JavaScript-код без markdown-обёртки, если не попросили иное.

## Встраивание в заметку

После установки виджет можно вставить строкой:

\`\`\`
::widget[my-widget]
\`\`\`

или включить в правой панели «Виджеты» → Настройки → Виджеты.
`;
