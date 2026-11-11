'use strict';

/**
 * Проверка синтаксиса без внешних зависимостей.
 * Renderer-файлы — ES-модули, поэтому проверяются как .mjs во временной папке.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'release', 'dist', 'out', '.git', 'build']);

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}

function checkFile(file, tempDir) {
  const relative = path.relative(ROOT, file);
  let target = file;
  if (relative.startsWith(`src${path.sep}renderer`)) {
    target = path.join(tempDir, `${relative.replace(/[\\/]/g, '_')}.mjs`);
    fs.writeFileSync(target, fs.readFileSync(file));
  }
  const result = spawnSync(process.execPath, ['--check', target], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return `${relative}\n${result.stderr || result.stdout}`;
  }
  const source = fs.readFileSync(file, 'utf8');
  if (relative.startsWith(`src${path.sep}renderer`)) {
    if (/\brequire\s*\(/.test(source) || /from\s+['"]node:/.test(source)) {
      return `${relative}: renderer не должен использовать require/Node.js API`;
    }
  }
  const importPattern = /(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    const resolved = path.resolve(path.dirname(file), specifier);
    const candidates = [
      resolved,
      `${resolved}.js`,
      `${resolved}.mjs`,
      path.join(resolved, 'index.js'),
    ];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      return `${relative}: не найден модуль ${specifier}`;
    }
  }
  return null;
}

function main() {
  const files = walk(ROOT).sort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmb-check-'));
  const errors = [];
  for (const file of files) {
    const error = checkFile(file, tempDir);
    if (error) errors.push(error);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });

  try {
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (error) {
    errors.push(`package.json: ${error.message}`);
  }

  if (errors.length) {
    console.error(`✗ Проверка не пройдена (${errors.length}):\n`);
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log(`✓ Синтаксис в порядке: ${files.length} JavaScript-файлов`);
}

main();
