'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, dialog } = require('electron');
const { getPaths } = require('./paths');
const { safeFileName } = require('./util');

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

async function exportMarkdown({ title = 'Заметка', body = '' }) {
  const result = await dialog.showSaveDialog(focusedWindow(), {
    title: 'Экспорт заметки в Markdown',
    defaultPath: `${safeFileName(title)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(body), 'utf8');
  return result.filePath;
}

async function exportPdf({ title = 'Заметка', html = '' }) {
  const result = await dialog.showSaveDialog(focusedWindow(), {
    title: 'Экспорт заметки в PDF',
    defaultPath: `${safeFileName(title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const { tmpDir } = getPaths();
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(
    tmpDir,
    `export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  );
  const safeHtml = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  fs.writeFileSync(tmpFile, safeHtml, 'utf8');

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      webSecurity: true,
    },
  });
  try {
    await printWindow.loadFile(tmpFile);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(result.filePath, pdf);
    return result.filePath;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
    fs.rm(tmpFile, { force: true }, () => {});
  }
}

module.exports = { exportMarkdown, exportPdf };
