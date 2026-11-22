# Changelog / История изменений

## 1.1.0 — 2026-11-22

### 🇷🇺 Русский

**Новый логотип**
- Обновлён логотип во всём приложении: экран загрузки, боковое меню, раздел «О приложении», favicon и иконка установщика.
- Логотип добавлен в README и описание репозитория.

**Интерфейс**
- Убраны дублирующиеся кнопки настроек. Теперь настройки открываются из того блока, к которому относятся: панель виджетов → настройки виджетов, панель предпросмотра → настройки вида.
- Верхняя панель стала компактнее: остались переключатели панелей, AI и меню действий.
- Добавлено управление левыми колонками: ширину меню и списка заметок можно менять перетаскиванием разделителей, а сами колонки — скрывать кнопками в верхней панели.
- Двойной клик по разделителю сбрасывает ширину.
- В **Настройки → Вид → Панели** добавлены переключатели видимости колонок и ползунки ширины.
- На узких экранах меню и список заметок по-прежнему открываются как выдвижные панели.

**Списки**
- Добавлена поддержка вложенных списков с корректной отрисовкой уровней в предпросмотре.
- `Tab` и `Shift + Tab` управляют вложенностью пунктов списка.
- Нумерация нумерованных списков пересчитывается автоматически после добавления, удаления и перемещения пунктов.
- Смена типа списка (маркированный ↔ нумерованный) больше не ломает отступы и выравнивание.
- `Enter` продолжает список с правильным номером и уровнем; пустой вложенный пункт сначала поднимается на уровень выше.
- Исправлено выравнивание чек-листов и вложенных задач в предпросмотре.

**Исправления**
- Проверены синтаксис, запуск и основные сценарии работы с заметками и списками.
- Обновлены README и горячие клавиши.

---

### 🇬🇧 English

**New logo**
- Updated the logo across the app: boot screen, sidebar, About section, favicon, and installer icon.
- Added the logo to the README and repository description.

**Interface**
- Removed duplicated settings buttons. Settings now open contextually from the block they belong to: widgets panel → widget settings, preview panel → appearance settings.
- Simplified the top bar: panel toggles, AI, and the actions menu remain.
- Added column management: drag the splitters to resize the sidebar and note list, and hide either column from the top bar.
- Double-click a splitter to reset its width.
- Added column visibility toggles and width sliders under **Settings → Appearance → Panels**.
- On narrow screens the sidebar and note list still open as slide-over panels.

**Lists**
- Added nested list support with correct rendering of each level in preview.
- `Tab` and `Shift + Tab` change list item nesting.
- Ordered lists renumber automatically after adding, deleting, or moving items.
- Switching list type (bulleted ↔ numbered) no longer breaks indentation or alignment.
- `Enter` continues lists with the correct number and level; an empty nested item is outdented first.
- Fixed checkbox and nested task alignment in preview.

**Fixes**
- Verified syntax, startup, and core note/list workflows.
- Updated README and keyboard shortcuts.
