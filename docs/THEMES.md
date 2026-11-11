# Темы

NMB Notes поддерживает встроенные темы (независимые порты популярных палитр Obsidian) и пользовательские темы в JSON.

## Встроенные темы

| ID | Название | Режим |
| --- | --- | --- |
| `obsidian-dark` | Obsidian Dark | тёмная |
| `obsidian-light` | Obsidian Light | светлая |
| `minimal-dark` | Minimal Dark | тёмная |
| `catppuccin-mocha` | Catppuccin Mocha | тёмная |
| `catppuccin-latte` | Catppuccin Latte | светлая |
| `tokyo-night` | Tokyo Night | тёмная |
| `nord` | Nord | тёмная |
| `rose-pine` | Rosé Pine | тёмная |
| `gruvbox-dark` | Gruvbox Dark | тёмная |
| `dracula` | Dracula | тёмная |
| `solarized-light` | Solarized Light | светлая |
| `blue-topaz` | Blue Topaz | тёмная |
| `things` | Things | светлая |
| `atom-one-dark` | Atom One Dark | тёмная |
| `everforest-dark` | Everforest Dark | тёмная |
| `ayu-mirage` | Ayu Mirage | тёмная |

Палитры — независимые порты цветовых схем, а не оригинальные CSS-файлы Obsidian. Права принадлежат авторам оригиналов.

## Своя тема

Файл `userData/themes/<id>.json`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "mode": "dark",
  "credit": "На основе моей палитры",
  "tokens": {
    "bg": "#1b1b22",
    "bgSidebar": "#20202a",
    "bgList": "#1e1e26",
    "bgPanel": "#20202a",
    "bgHover": "#2b2b36",
    "bgActive": "#343440",
    "bgInput": "#17171d",
    "text": "#d7d7e0",
    "textDim": "#8a8a9a",
    "textBright": "#ffffff",
    "border": "#30303c",
    "borderLight": "#404050",
    "accent": "#9d7bff",
    "accentHover": "#b095ff",
    "accentText": "#ffffff",
    "danger": "#e5534b",
    "warning": "#e0a800",
    "success": "#4caf50",
    "codeBg": "#2b2b36",
    "codeColor": "#ffb86c",
    "quote": "#9d7bff",
    "selection": "rgba(157,123,255,.25)",
    "shadow": "rgba(0,0,0,.45)"
  },
  "css": "/* необязательные дополнительные стили */"
}
```

Импортировать можно через **Настройки → Вид → Импорт темы (JSON)** или положить файл в папку `themes` и перезапустить приложение.

## Токены

| Токен | CSS-переменная | Назначение |
| --- | --- | --- |
| `bg` | `--bg` | фон рабочей области |
| `bgSidebar` | `--bg-sidebar` | меню и AI-панель |
| `bgList` | `--bg-list` | список заметок, карточки |
| `bgPanel` | `--bg-panel` | предпросмотр, меню, модальные окна |
| `bgHover` | `--bg-hover` | наведение |
| `bgActive` | `--bg-active` | активный элемент |
| `bgInput` | `--bg-input` | поля ввода |
| `text` | `--text` | основной текст |
| `textDim` | `--text-dim` | вторичный текст |
| `textBright` | `--text-bright` | заголовки |
| `border` | `--border` | границы |
| `borderLight` | `--border-light` | границы контролов |
| `accent` | `--accent` | акцент |
| `accentHover` | `--accent-hover` | акцент при наведении |
| `accentText` | `--accent-text` | текст на акценте |
| `danger` / `warning` / `success` | одноимённые | статусы |
| `codeBg` / `codeColor` | одноимённые | инлайн-код |
| `quote` | `--quote` | цитаты |
| `selection` | `--selection` | выделение текста |
| `shadow` | `--shadow` | тени |

Недостающие токены берутся из Obsidian Dark. Значения — любые валидные CSS-цвета/строки без `<`, `>`, `{`, `}`. Размер файла — до 200 КБ.

## Дополнительно

- **Акцентный цвет** и **плотность** — в **Настройки → Вид**.
- **Свой CSS** — snippets в стиле Obsidian, применяются сразу. Можно менять любые классы интерфейса.
- **Экспорт текущей темы** копирует JSON в буфер обмена.
- Пользовательская тема удаляется кнопкой на карточке в галерее.
