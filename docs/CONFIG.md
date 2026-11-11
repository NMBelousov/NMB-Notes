# Конфигурация приложения

NMB Notes читает необязательный JSON-конфиг, как Obsidian читает настройки хранилища. Файл создаётся автоматически при первом запуске.

## Путь

`userData/config/app.json`

- macOS: `~/Library/Application Support/NMB Notes/config/app.json`
- Windows: `%APPDATA%\NMB Notes\config\app.json`
- Linux: `~/.config/NMB Notes/config/app.json`

Открыть папку: **Настройки → Данные → Открыть config**.

## Формат

```json
{
  "window": {
    "width": 1440,
    "height": 920,
    "minWidth": 940,
    "minHeight": 600
  },
  "defaults": {
    "theme": "catppuccin-mocha",
    "appearance": {
      "editorFontSize": 15,
      "lineHeight": 1.75
    },
    "ai": {
      "model": "deepseek-chat",
      "includeContext": true
    },
    "widgets": {
      "enabled": ["stats", "outline", "quick-actions"]
    },
    "updates": {
      "repo": "NMBelousov/NMB---Note-s",
      "channel": "latest",
      "checkOnStartup": true
    }
  },
  "security": {
    "allowExternalLinks": true
  },
  "devTools": false
}
```

### `window`

Размеры окна при запуске. Значения ограничиваются безопасными диапазонами (ширина 940–3840, высота 600–2160, минимум 720×480).

### `defaults`

Значения по умолчанию, которые **глубоко** накладываются на встроенные настройки до загрузки `settings.json`. Ваши изменения через интерфейс хранятся в `settings.json` и имеют приоритет. Удобно для корпоративного/личного профиля по умолчанию.

Доступные ключи — как в `electron/lib/settings.js`:

- `theme`
- `appearance.uiFont`, `editorFont`, `editorFontSize`, `lineHeight`, `accent`, `compact`, `customCss`
- `layout.sidebar`, `listWidth`, `previewWidth`, `rightTab`
- `editor.livePreview`, `slashMenu`, `smartLists`, `spellcheck`, `autoSaveMs`
- `ai.baseUrl`, `model`, `temperature`, `maxTokens`, `includeContext`, `stream`
- `widgets.enabled`
- `updates.repo`, `updates.channel`, `updates.apiBase`, `updates.checkOnStartup`

> API-ключ DeepSeek и GitHub-токен в конфиг не записываются. Они хранятся отдельно в зашифрованном `secrets.enc`.

### `security.allowExternalLinks`

Зарезервировано для политики внешних ссылок. По умолчанию `true`; ссылки http/https/mailto открываются в системном браузере.

### `devTools`

Если `true`, в меню «Вид» появляется пункт DevTools. В `npm run dev` DevTools открываются сразу.

## Перезагрузка

После редактирования файла нажмите **Настройки → Данные → Перечитать config**. Размер окна применится при следующем запуске, настройки по умолчанию — при следующем запуске или сбросе.

## Пользовательские расширения

- Темы: `userData/themes/*.json` — см. [THEMES.md](THEMES.md).
- Виджеты: `userData/widgets/*.js` — см. [WIDGETS.md](WIDGETS.md).
- Кастомный CSS: **Настройки → Вид → Свой CSS** (хранится в `settings.json`).

## Бэкапы

- Автоматически раз в день: `userData/backups/backup-YYYY-MM-DD.json`.
- Вручную: **Настройки → Данные → Создать резервную копию**.
- Ротация: хранится до 20 последних копий (ежедневные и ручные).
- Экспорт/импорт vault — JSON с заметками и папками.
