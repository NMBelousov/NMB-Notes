'use strict';

/**
 * Ad-hoc подпись macOS-приложения.
 *
 * Без Apple Developer сертификата DMG не нотаризуется, но ad-hoc подпись
 * (`codesign --sign -`) делает arm64-сборку запускаемой на Apple Silicon.
 * Пользователю всё равно нужно снять quarantine: xattr -cr "NMB Notes.app".
 */

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') {
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  console.log(`[after-pack] ad-hoc подпись: ${appPath}`);
  await execFileAsync(
    'codesign',
    ['--force', '--deep', '--sign', '-', appPath],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  console.log('[after-pack] готово');
};
