'use strict';

const { Menu, app, shell, dialog } = require('electron');
const { getPaths } = require('./paths');

function send(win, action, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:action', { action, payload });
  }
}

function buildMenu(win, { isDev = false, config = {} } = {}) {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'О NMB Notes' },
              { type: 'separator' },
              {
                label: 'Настройки…',
                accelerator: 'CmdOrCtrl+,',
                click: () => send(win, 'settings', { tab: 'appearance' }),
              },
              { type: 'separator' },
              { role: 'services', label: 'Службы' },
              { type: 'separator' },
              { role: 'hide', label: 'Скрыть NMB Notes' },
              { role: 'hideOthers', label: 'Скрыть остальные' },
              { role: 'unhide', label: 'Показать все' },
              { type: 'separator' },
              { role: 'quit', label: 'Выйти из NMB Notes' },
            ],
          },
        ]
      : []),
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Новая заметка',
          accelerator: 'CmdOrCtrl+N',
          click: () => send(win, 'new-note'),
        },
        {
          label: 'Новая папка',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send(win, 'new-folder'),
        },
        { type: 'separator' },
        {
          label: 'Импорт Markdown…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send(win, 'import-markdown'),
        },
        {
          label: 'Экспорт заметки в Markdown…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send(win, 'export-markdown'),
        },
        {
          label: 'Экспорт заметки в PDF…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send(win, 'export-pdf'),
        },
        { type: 'separator' },
        ...(isMac
          ? []
          : [
              {
                label: 'Настройки…',
                accelerator: 'CmdOrCtrl+,',
                click: () => send(win, 'settings', { tab: 'appearance' }),
              },
              { type: 'separator' },
              { role: 'quit', label: 'Выход' },
            ]),
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
        { type: 'separator' },
        {
          label: 'Найти заметку',
          accelerator: 'CmdOrCtrl+K',
          click: () => send(win, 'search'),
        },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Все заметки',
          accelerator: 'CmdOrCtrl+1',
          click: () => send(win, 'view-all'),
        },
        {
          label: 'Избранное',
          accelerator: 'CmdOrCtrl+2',
          click: () => send(win, 'view-favorites'),
        },
        { type: 'separator' },
        {
          label: 'Предпросмотр',
          accelerator: 'CmdOrCtrl+Shift+Y',
          click: () => send(win, 'tab-preview'),
        },
        {
          label: 'Виджеты',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => send(win, 'tab-widgets'),
        },
        {
          label: 'AI-панель',
          accelerator: 'CmdOrCtrl+E',
          click: () => send(win, 'toggle-ai'),
        },
        { type: 'separator' },
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить без кэша' },
        ...(isDev || config.devTools
          ? [{ role: 'toggleDevTools', label: 'Инструменты разработчика' }]
          : []),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Масштаб 100%' },
        { role: 'zoomIn', label: 'Увеличить масштаб' },
        { role: 'zoomOut', label: 'Уменьшить масштаб' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран' },
      ],
    },
    {
      label: 'Помощь',
      submenu: [
        {
          label: 'Проверить обновления…',
          click: () => send(win, 'check-updates'),
        },
        {
          label: 'Руководство по виджетам',
          click: () => send(win, 'docs-widgets'),
        },
        {
          label: 'Горячие клавиши',
          click: () => send(win, 'shortcuts'),
        },
        {
          label: 'Папка с данными',
          click: () => shell.openPath(getPaths().root),
        },
        {
          label: 'DeepSeek Platform',
          click: () => shell.openExternal('https://platform.deepseek.com'),
        },
        { type: 'separator' },
        {
          label: 'О приложении',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'NMB Notes',
              message: `NMB Notes ${app.getVersion()}`,
              detail: [
                'Локальный редактор заметок с AI-помощником DeepSeek.',
                `Electron ${process.versions.electron} · Node ${process.versions.node}`,
                `Данные: ${getPaths().root}`,
              ].join('\n'),
              buttons: ['Закрыть'],
            }),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function installMenu(win, options) {
  // На Windows/Linux нативное меню убираем: Alt/Alt+Shift при смене
  // раскладки не должны открывать меню «Файл». Все команды доступны
  // через горячие клавиши renderer-процесса.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return null;
  }
  const menu = buildMenu(win, options);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { installMenu, buildMenu };
