# NMB Notes

Локальный Markdown-редактор для заметок и задач: **четыре колонки**, живой предпросмотр, slash-меню, **AI-помощник DeepSeek**, **компонентные виджеты**, папки, теги, корзина, экспорт в PDF и **16 тем в стиле Obsidian**.

Приложение работает как десктопное на Electron (macOS / Windows / Linux) и не требует сборки frontend-стека: только простой HTML + JavaScript.

![NMB Notes](build/icon.png)

## Возможности

- **4 колонки**: меню → список заметок → редактор → предпросмотр/виджеты.
- **Markdown**: заголовки, списки, чек-листы, таблицы, код, цитаты, wiki-ссылки `[[Название]]`, задачи с кликабельными чекбоксами в предпросмотре.
- **Slash-меню** (`/` в начале строки): блоки, AI-действия, вставка виджетов.
- **AI-помощник DeepSeek**: потоковые ответы, контекст заметки, резюме, задачи, продолжение текста, вставка и копирование ответа.
- **Безопасное хранение ключа**: `safeStorage` (Keychain / DPAPI) либо AES-256-GCM. Ключ никогда не попадает в renderer.
- **Темы**: Obsidian Dark/Light, Minimal, Catppuccin Mocha/Latte, Tokyo Night, Nord, Rosé Pine, Gruvbox, Dracula, Solarized Light, Blue Topaz, Things, One Dark, Everforest, Ayu Mirage. Свои темы — JSON-файлом, плюс кастомный CSS и акцентный цвет.
- **Виджеты**: встроенные (статистика, оглавление, быстрые AI-действия, теги, связанные заметки, Pomodoro), свои ES-модули и **генерация виджетов через AI**.
- **Данные**: папки, теги, избранное, корзина, импорт/экспорт Markdown, экспорт vault JSON, ежедневные бэкапы, атомарная запись.
- **UI**: тёмная/светлая/сепия и другие палитры, компактный режим, настраиваемые шрифты и ширина панелей, горячие клавиши, адаптивная верстка.
- **Безопасность**: sandbox renderer, contextIsolation, запрет Node.js в UI, CSP, блокировка навигации, whitelist внешних ссылок.

## Быстрый старт

```bash
npm install
npm start          # запуск приложения
npm run dev        # запуск с DevTools
npm run check      # проверка синтаксиса без внешних зависимостей
```

> Electron скачивает бинарник при первом запуске. Для Linux могут понадобиться системные библиотеки GTK/ATK — это требование Electron, а не приложения.

### Сборка

```bash
npm run dist:mac   # один DMG для macOS ARM64 (Apple Silicon)
npm run dist:win   # NSIS installer x64 (локально на Windows)
npm run dist:linux # AppImage + deb (локально на Linux)
npm run pack       # распакованная сборка для проверки
```

Артефакты появляются в `release/`.

### CI/CD

CI собирает две версии — по **одному установочному файлу на систему**, без ZIP и лишних артефактов:

- **macOS ARM64 (Apple Silicon)** → `NMB-Notes-<version>-mac-arm64.dmg`
- **Windows x64** → `NMB-Notes-<version>-win-x64-setup.exe`

- Каждый push в `main` и ручной запуск обновляют общий релиз **`latest`** с двумя файлами.
- Push тега `v*` создаёт отдельный GitHub Release с теми же двумя файлами.
- macOS-приложение подписывается ad-hoc в `scripts/after-pack.js`. Нотаризации Apple нет, поэтому первый запуск требует снятия quarantine (см. ниже).
- Windows-установщик не подписан, поэтому SmartScreen может попросить **«Подробнее → Выполнить всё равно»**.

Linux-сборка пока доступна только локально.

## Настройка AI

1. Получите ключ на [platform.deepseek.com](https://platform.deepseek.com).
2. Откройте **Настройки → AI**.
3. Вставьте ключ и нажмите «Сохранить ключ».
4. Проверьте подключение кнопкой «Проверить подключение».

Модели: `deepseek-chat` (быстрая) и `deepseek-reasoner` (с рассуждениями). Можно указать совместимый OpenAI-эндпоинт в «Базовый URL» (HTTPS; HTTP разрешён только для localhost).

**Что уходит в API:** сообщения чата и — если включён «Контекст заметки» — текст активной заметки. Телеметрии и фоновых запросов нет.

## Где хранятся данные

Профиль приложения — стандартная папка `userData` Electron:

- macOS: `~/Library/Application Support/NMB Notes/`
- Windows: `%APPDATA%\NMB Notes\`
- Linux: `~/.config/NMB Notes/`

```
vault.json                заметки и папки
settings.json             настройки интерфейса, AI, виджетов
secrets.enc               зашифрованный API-ключ
config/app.json           конфиг как в Obsidian (window, defaults)
themes/*.json             пользовательские темы
widgets/*.js              пользовательские виджеты
backups/*.json            ежедневные и ручные бэкапы
```

Точный путь показан в **Настройки → Данные**.

### Конфиг приложения

Необязательный `config/app.json` создаётся при первом запуске:

```json
{
  "window": { "width": 1440, "height": 920, "minWidth": 940, "minHeight": 600 },
  "defaults": { "theme": "obsidian-dark" },
  "security": { "allowExternalLinks": true },
  "devTools": false
}
```

`defaults` применяются только к значениям, которых ещё нет в пользовательских настройках. Подробнее — [docs/CONFIG.md](docs/CONFIG.md).

## Виджеты

Включить и настроить: **Настройки → Виджеты** или вкладка «Виджеты» справа.

Встроенные:

| ID | Название |
| --- | --- |
| `stats` | Статистика заметки |
| `outline` | Оглавление |
| `quick-actions` | Быстрые действия AI |
| `tags` | Теги заметки |
| `related` | Связанные заметки по `[[...]]` |
| `focus-timer` | Таймер фокуса 25/5 |

Встроить в заметку:

```markdown
::widget[stats]
```

Свой виджет — ES-модуль в `userData/widgets/<id>.js`:

```js
export default {
  id: 'hello',
  name: 'Hello',
  description: 'Показывает заголовок заметки',
  icon: '👋',
  render(container, ctx) {
    const paint = () => {
      container.textContent = ctx.getNote()?.title || 'Нет заметки';
    };
    paint();
    const off = ctx.on('note:changed', paint);
    return () => off();
  },
};
```

Установка: **Настройки → Виджеты → Установить из кода** или **Создать с AI**. Полное API — [docs/WIDGETS.md](docs/WIDGETS.md), готовый промпт для внешней AI — [docs/AI_WIDGET_PROMPT.md](docs/AI_WIDGET_PROMPT.md).

## Темы

Встроенные темы — независимые порты популярных палитр Obsidian. Своя тема — JSON в `userData/themes/`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "mode": "dark",
  "tokens": {
    "bg": "#1b1b22",
    "bgSidebar": "#20202a",
    "bgPanel": "#20202a",
    "bgList": "#1e1e26",
    "bgHover": "#2b2b36",
    "bgActive": "#343440",
    "bgInput": "#17171d",
    "border": "#30303c",
    "borderLight": "#404050",
    "text": "#d7d7e0",
    "textDim": "#8a8a9a",
    "textBright": "#ffffff",
    "accent": "#9d7bff",
    "accentHover": "#b095ff",
    "accentText": "#ffffff",
    "codeBg": "#2b2b36",
    "codeColor": "#ffb86c",
    "quote": "#9d7bff",
    "selection": "rgba(157,123,255,.25)",
    "shadow": "rgba(0,0,0,.45)"
  }
}
```

Импорт через **Настройки → Вид → Импорт темы (JSON)**. Подробнее — [docs/THEMES.md](docs/THEMES.md).

## Горячие клавиши

| Действие | Клавиши |
| --- | --- |
| Новая заметка | `Ctrl/Cmd + N` |
| Новая папка | `Ctrl/Cmd + Shift + N` |
| Поиск заметок | `Ctrl/Cmd + K` |
| Найти (фокус в поиск) | `Ctrl/Cmd + F` |
| Сохранить сейчас | `Ctrl/Cmd + S` |
| AI-панель | `Ctrl/Cmd + E` |
| Настройки | `Ctrl/Cmd + ,` |
| Предпросмотр | `Ctrl/Cmd + Shift + Y` |
| Виджеты | `Ctrl/Cmd + Shift + W` |
| Дублировать заметку | `Ctrl/Cmd + Shift + D` |
| Экспорт PDF | `Ctrl/Cmd + Shift + P` |
| Импорт Markdown | `Ctrl/Cmd + O` |
| Slash-меню | `/` в начале строки |
| Закрыть панель | `Esc` |

## Архитектура

```
electron/
  main.js                 BrowserWindow, IPC, жизненный цикл, безопасность
  preload.js              мост window.api (contextBridge)
  lib/ai.js               DeepSeek chat + SSE streaming
  lib/secrets.js          safeStorage / AES-256-GCM
  lib/notes.js            vault.json, папки, импорт/экспорт, бэкапы
  lib/settings.js         настройки + санитизация
  lib/themes.js           пользовательские темы
  lib/widgets.js          файлы виджетов
  lib/exporter.js         Markdown / PDF через printToPDF
  lib/menu.js             нативное меню
src/renderer/
  index.html
  styles/                 base / layout / components / widgets
  js/app.js               bootstrap и глобальные события
  js/state.js             состояние + автосохранение
  js/markdown.js          безопасный Markdown-рендерер
  js/theme.js             применение тем
  js/widgets/registry.js  реестр виджетов + context API
  js/widgets/builtin/     встроенные виджеты
  js/components/          sidebar, noteList, editor, rightPanel, aiPanel, settings…
  themes/index.js         16 встроенных тем
docs/                     виджеты, темы, конфиг, AI-промпт
.github/workflows/        CI: macOS ARM64 DMG + Windows x64 EXE
```

Компоненты общаются через небольшой event bus и `window.api`; сторонних runtime-зависимостей нет. Только `electron` и `electron-builder` в devDependencies.

## Безопасность

- Renderer: `contextIsolation`, `sandbox`, без `nodeIntegration`, без `webview`.
- CSP запрещает удалённые скрипты, формы, фреймы и соединения из renderer.
- AI-запросы выполняются в main-процессе; ключ не доступен UI.
- Внешние ссылки открываются только по http/https/mailto в системном браузере.
- Пользовательские виджеты не имеют Node.js и сети; выполняются в sandbox renderer. **Устанавливайте только доверенный код.**
- Заметки и настройки пишутся атомарно; при закрытии приложение дожидается сохранения.
- PDF собирается в скрытом окне без JavaScript; скрипты и inline-обработчики вырезаются.

## Решение проблем

- **macOS: «Приложение повреждено» / Gatekeeper.** Сборка подписана ad-hoc, но не нотаризована. Выполните `xattr -cr "/Applications/NMB Notes.app"`, затем откройте приложение (или правый клик → «Открыть»).
- **Windows: SmartScreen.** Нажмите «Подробнее» → «Выполнить всё равно» — установщик не подписан сертификатом.
- **Linux: не хватает библиотек.** Установите `libgtk-3-0 libnss3 libasound2` и другие зависимости Electron. В контейнере от root может понадобиться `--no-sandbox`.
- **AI отвечает 401/402.** Проверьте ключ и баланс на platform.deepseek.com; кнопка «Проверить подключение» покажет причину.
- **Пустое окно.** Запустите `npm run dev` и посмотрите консоль/DevTools: обычно это синтаксическая ошибка в пользовательском виджете или кастомном CSS.
- **Потеряли ключ после переноса профиля.** `secrets.enc` привязан к системному хранилищу/локальному ключу — добавьте ключ заново.

## Лицензия

MIT. Встроенные темы — независимые порты; права на оригинальные палитры принадлежат их авторам.
