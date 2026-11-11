'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('./paths');

const ID_RE = /^[a-z0-9][a-z0-9-_]{0,48}$/;
const MAX_SOURCE = 300 * 1024;

function listWidgets() {
  const { widgetsDir } = getPaths();
  try {
    fs.mkdirSync(widgetsDir, { recursive: true });
    return fs
      .readdirSync(widgetsDir)
      .filter((name) => name.endsWith('.js'))
      .slice(0, 200)
      .map((name) => {
        const file = path.join(widgetsDir, name);
        try {
          const stat = fs.statSync(file);
          if (stat.size > MAX_SOURCE) return null;
          const source = fs.readFileSync(file, 'utf8');
          return {
            id: name.replace(/\.js$/, ''),
            source,
            updatedAt: stat.mtimeMs,
            bytes: stat.size,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveWidget({ id, source } = {}) {
  const cleanId = String(id || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!ID_RE.test(cleanId)) throw new Error('Некорректный id виджета');
  if (typeof source !== 'string') throw new Error('Нет исходного кода');
  if (source.length > MAX_SOURCE) throw new Error('Код виджета слишком большой');
  if (!/export\s+default/.test(source)) {
    throw new Error('Виджет должен экспортировать объект через export default');
  }
  if (/(require\s*\(|process\.|child_process|node:)/.test(source)) {
    throw new Error('Виджет не должен использовать Node.js API');
  }
  const { widgetsDir } = getPaths();
  fs.mkdirSync(widgetsDir, { recursive: true });
  const file = path.join(widgetsDir, `${cleanId}.js`);
  fs.writeFileSync(file, source, { mode: 0o600, encoding: 'utf8' });
  return { id: cleanId, bytes: Buffer.byteLength(source) };
}

function deleteWidget(id) {
  if (!ID_RE.test(String(id))) throw new Error('Некорректный id виджета');
  const { widgetsDir } = getPaths();
  fs.rmSync(path.join(widgetsDir, `${id}.js`), { force: true });
  return listWidgets();
}

function exportWidgetTemplate() {
  return `// NMB Notes widget — экспорт по умолчанию
export default {
  id: 'my-widget',
  name: 'Мой виджет',
  description: 'Короткое описание',
  icon: '✨',
  version: '1.0.0',
  render(container, ctx) {
    const note = ctx.getNote();
    container.textContent = \`Слов: \${(note?.body || '').trim().split(/\\s+/).length}\`;
    const off = ctx.on('note:changed', () => {
      const current = ctx.getNote();
      container.textContent = \`Слов: \${(current?.body || '').trim().split(/\\s+/).length}\`;
    });
    return () => off();
  },
};
`;
}

module.exports = { listWidgets, saveWidget, deleteWidget, exportWidgetTemplate };
