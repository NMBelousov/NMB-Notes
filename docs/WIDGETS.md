# Виджеты NMB Notes

Виджет — это ES-модуль, который экспортирует объект с функцией `render(container, ctx)`. Виджеты встраиваются в правую панель, в заметку через `::widget[id]` или создаются через AI.

## Где лежат виджеты

- Встроенные: `src/renderer/js/widgets/builtin/` (реестр в `registry.js`).
- Пользовательские: `userData/widgets/<id>.js` (точный путь — Настройки → Данные → «Открыть папку виджетов»).

При старте приложение загружает все `*.js` из папки и импортирует их как ES-модули через Blob URL. Ошибки импорта не ломают приложение — они показываются в **Настройки → Виджеты**.

## Структура модуля

```js
export default {
  id: 'clock',                    // a-z, 0-9, дефис, _, до 49 символов
  name: 'Часы',
  description: 'Текущее время',
  icon: '🕒',                    // эмодзи в панели
  version: '1.0.0',

  render(container, ctx) {
    // container — пустой HTMLElement, уже вставлен в DOM
    const paint = () => {
      container.textContent = new Date().toLocaleTimeString('ru-RU');
    };
    paint();
    const timer = setInterval(paint, 1000);

    // Верните cleanup — его вызовут при перерисовке/закрытии
    return () => clearInterval(timer);
  },
};
```

Виджет может рендериться одновременно в панели и в заметке — это разные экземпляры с разными `container`. Не используйте глобальные переменные, всё состояние держите в замыкании или в `ctx.storage`.

## Context API

### Данные

| Метод | Описание |
| --- | --- |
| `ctx.getNote()` | активная заметка `{ id, title, body, folderId, favorite, createdAt, updatedAt, deletedAt }` или `null` |
| `ctx.getNotes()` | все неудалённые заметки |
| `ctx.getFolders()` | папки |
| `ctx.getSettings()` | текущие настройки |
| `ctx.getTheme()` | id темы |
| `ctx.getAppVersion()` | версия приложения |

### Действия

| Метод | Описание |
| --- | --- |
| `ctx.insertText(text, { mode })` | вставить в редактор: `'cursor'` (по умолчанию) или `'end'` |
| `ctx.replaceSelection(text)` | заменить выделение |
| `ctx.setSearch(query)` | запустить поиск заметок |
| `ctx.openNote(id)` | открыть заметку |
| `ctx.openSettings(tab)` | открыть настройки: `appearance`, `ai`, `widgets`, `editor`, `data`, `about` |
| `ctx.openAI(prompt)` | открыть AI-панель с запросом |
| `ctx.focusHeading(line)` | прокрутить предпросмотр к заголовку |
| `ctx.focusEditorLine(line)` | перейти к строке в редакторе |
| `ctx.notify(message, type)` | тост: `success`, `error`, `warn` |
| `await ctx.askAI(prompt, options)` | запрос к DeepSeek; `options`: `{ system, model, temperature, maxTokens, includeContext }` |

### События

`ctx.on(event, handler)` возвращает функцию отписки.

`note:changed`, `note:selected`, `vault:changed`, `settings:changed`, `theme:applied`, `save:state`, `widgets:changed`.

```js
const off = ctx.on('note:changed', () => render());
return () => off();
```

### Хранилище

```js
ctx.storage.set('goal', 500);
const goal = ctx.storage.get('goal', 300);
ctx.storage.delete('goal');
```

Значения сериализуются в JSON и хранятся в localStorage профиля с namespace `nmb-widget:<id>:<key>`. Для каждого виджета пространство имён своё.

### DOM и Markdown

- `ctx.el(tag, props, ...children)` — тот же хелпер `h`, что внутри приложения.
- `ctx.markdown.render(text)` — безопасный HTML из Markdown.
- `ctx.markdown.plain(text)` — текст без разметки.

### `ctx.api`

Мост `window.api` (Electron IPC). Используйте осторожно; все методы возвращают Promise. Например, `ctx.api.app.openExternal(url)` или `ctx.api.ai.keyStatus()`.

## Правила и ограничения

1. **Нет Node.js**: запрещены `require`, `process`, `child_process`, `node:*`. Main-процесс отклонит установку такого кода.
2. **Нет сети**: CSP renderer запрещает `fetch`/XHR на внешние адреса. Для AI используйте `ctx.askAI`, для внешних ссылок — `ctx.api.app.openExternal`.
3. **Нет HTML-инъекций**: не вставляйте пользовательский текст через `innerHTML`; используйте `textContent` или `ctx.el`.
4. **Cleanup обязателен**: таймеры, интервалы, подписки и наблюдатели нужно освобождать в возвращаемой функции.
5. **Без импортов**: пользовательский виджет — один файл; `import` других модулей не поддерживается.
6. **Работа без заметки**: `ctx.getNote()` может быть `null`.
7. **Доступность**: используйте семантические кнопки, `title`, `aria-label`.

## Встраивание в заметку

```markdown
::widget[clock]
```

Виджет отрисуется в предпросмотре, даже если выключен в панели. Настройки виджета можно передать JSON:

```markdown
::widget[stats]{"compact":true}
```

В `render` они доступны как `ctx.config`.

## Стили

Можно использовать существующие классы:

- `btn`, `btn primary`, `btn small`, `btn ghost`, `btn danger`
- `w-empty`, `widget-error`
- `w-stats`, `w-stat` (статистика)
- `w-outline` (оглавление)
- `w-actions`, `w-action` (кнопки)
- `w-tags`, `w-tag`
- `w-related`
- `w-timer*`

Или inline-стили через `ctx.el('div', { style: { ... } })`. Цвета берите из CSS-переменных темы: `var(--text)`, `var(--text-dim)`, `var(--accent)`, `var(--border)`, `var(--bg-list)` и т.д.

## Создание через AI

В приложении: **Настройки → Виджеты → Создать с AI**. Опишите виджет, AI получит это руководство и вернёт код; код можно отредактировать перед установкой.

Для внешней AI используйте промпт из [AI_WIDGET_PROMPT.md](AI_WIDGET_PROMPT.md) и вставьте результат в **Установить из кода**.

## Отладка

- Ошибки рендера показываются прямо в карточке виджета.
- Ошибки загрузки — в настройках виджетов.
- При запуске `npm run dev` доступны DevTools: `Ctrl/Cmd + Shift + I` (или меню «Вид»).
- После изменения файла нажмите «Перезагрузить» в настройках виджетов или перезапустите приложение.
