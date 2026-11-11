# Промпт для создания виджета во внешней AI

Скопируйте текст ниже в ChatGPT / Claude / DeepSeek и добавьте описание виджета. Затем вставьте полученный код в **NMB Notes → Настройки → Виджеты → Установить из кода**.

---

Ты пишешь виджет для приложения NMB Notes. Верни **только JavaScript-код** ES-модуля, без markdown-обёртки, начиная с `export default`.

## Требования

- Один файл, никаких импортов, `require`, `process`, Node.js API и сетевых запросов.
- Объект: `{ id, name, description, icon, version, render(container, ctx) }`.
- `id`: строчная латиница, цифры, дефис/подчёркивание, до 49 символов.
- `render` получает пустой `container` и `ctx`; возвращает функцию cleanup, если использует таймеры/подписки.
- Не используй `innerHTML` для пользовательских данных — только `textContent` или `ctx.el`.
- Работай корректно, когда `ctx.getNote()` вернул `null`.
- Стили — через CSS-переменные темы: `var(--text)`, `var(--text-dim)`, `var(--text-bright)`, `var(--accent)`, `var(--border)`, `var(--bg-list)`, `var(--danger)`.
- Можно использовать классы: `btn`, `btn primary`, `btn small`, `btn ghost`, `btn danger`, `w-empty`, `widget-error`, `w-stats`, `w-stat`.

## Context API

- `ctx.getNote()` → `{ id, title, body, folderId, favorite, updatedAt }` | `null`
- `ctx.getNotes()`, `ctx.getFolders()`, `ctx.getSettings()`, `ctx.getTheme()`
- `ctx.insertText(text, { mode: 'cursor' | 'end' })`
- `ctx.replaceSelection(text)`
- `ctx.setSearch(query)`
- `ctx.openNote(id)`
- `ctx.openSettings(tab)` — appearance | ai | widgets | editor | data | about
- `ctx.openAI(prompt)`
- `ctx.focusHeading(line)`, `ctx.focusEditorLine(line)`
- `ctx.notify(message, 'success' | 'error' | 'warn')`
- `ctx.on(event, handler)` → unsubscribe. События: `note:changed`, `note:selected`, `vault:changed`, `settings:changed`, `theme:applied`
- `ctx.storage.get(key, fallback)`, `ctx.storage.set(key, value)`, `ctx.storage.delete(key)`
- `ctx.markdown.render(text)`, `ctx.markdown.plain(text)`
- `ctx.el(tag, props, ...children)` — DOM-хелпер
- `await ctx.askAI(prompt, { system?, includeContext? })` → текст DeepSeek
- `ctx.api` — Electron bridge (осторожно)

## Пример

```js
export default {
  id: 'word-goal',
  name: 'Цель по словам',
  description: 'Прогресс до 500 слов',
  icon: '🎯',
  version: '1.0.0',
  render(container, ctx) {
    const wrap = ctx.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' } });
    const bar = ctx.el('div', {
      style: { height: '6px', background: 'var(--bg-active)', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }
    });
    const fill = ctx.el('div', { style: { height: '100%', background: 'var(--accent)', width: '0%' } });
    bar.appendChild(fill);
    wrap.append('Слов: 0 / 500', bar);
    container.appendChild(wrap);

    const paint = () => {
      const text = ctx.getNote()?.body || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      wrap.firstChild.textContent = `Слов: ${words} / 500`;
      fill.style.width = `${Math.min(100, (words / 500) * 100)}%`;
    };
    paint();
    const off = ctx.on('note:changed', paint);
    return () => off();
  },
};
```

## Задача

Создай виджет: **ОПИСАНИЕ ВИДЖЕТА**
