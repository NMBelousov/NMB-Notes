'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { app, shell } = require('electron');
const { getPaths } = require('./paths');
const { getSettings } = require('./settings');
const {
  getGithubToken,
  setGithubToken,
  clearGithubToken,
  githubStatus,
} = require('./secrets');

const USER_AGENT = `NMB-Notes/${app.getVersion()}`;
const API_VERSION = '2022-11-28';
let lastDownload = null;

function normalizeChannel(value) {
  const channel = String(value || 'latest').trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(channel) ? channel : 'latest';
}

function tokenAllowedFor(apiBase) {
  try {
    return new URL(apiBase).origin === 'https://api.github.com';
  } catch {
    return false;
  }
}

function compareVersions(a, b) {
  const parse = (value) =>
    String(value || '0')
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l > r ? 1 : -1;
    } else {
      const ls = String(l);
      const rs = String(r);
      if (ls !== rs) return ls > rs ? 1 : -1;
    }
  }
  return 0;
}

function parseVersion(text) {
  const match = String(text || '').match(/(?:NMB-Notes-)?v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function assetForPlatform(assets) {
  const pattern =
    process.platform === 'win32'
      ? /\.exe$/i
      : process.platform === 'darwin'
        ? /\.dmg$/i
        : /\.(AppImage|deb)$/i;
  const matches = assets.filter((asset) => pattern.test(asset.name || ''));
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return matches.find((asset) => /arm64/i.test(asset.name)) || matches[0] || null;
  }
  if (process.platform === 'win32') {
    return matches.find((asset) => /x64|win/i.test(asset.name)) || matches[0] || null;
  }
  return matches[0] || null;
}

function friendlyHttpError(status, detail) {
  if (status === 404) {
    return new Error(
      'Релиз не найден. Для приватного GitHub-репозитория добавьте токен в Настройки → Обновления.'
    );
  }
  if (status === 401) return new Error('GitHub отклонил токен. Проверьте его в настройках обновлений.');
  if (status === 403) {
    return new Error(
      detail?.includes('rate limit')
        ? 'Превышен лимит GitHub API. Попробуйте позже или добавьте токен.'
        : 'Нет доступа к релизам GitHub. Проверьте права токена (Contents: Read).'
    );
  }
  if (status >= 500) return new Error('GitHub временно недоступен. Попробуйте позже.');
  return new Error(detail ? `GitHub API (${status}): ${detail}` : `GitHub API вернул ${status}`);
}

async function githubRequest(url, token, options = {}) {
  const headers = {
    Accept: options.accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout
        ? AbortSignal.timeout(options.timeout || 30000)
        : undefined,
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new Error('GitHub не ответил вовремя. Проверьте интернет.');
    }
    throw new Error('Нет соединения с GitHub. Проверьте интернет.');
  }
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.message || '';
    } catch {
      /* ignore */
    }
    throw friendlyHttpError(response.status, detail);
  }
  return response;
}

async function fetchReleases(settings, token, channel) {
  const base = settings.updates.apiBase.replace(/\/+$/, '');
  const repo = settings.updates.repo;
  const headers = { token, accept: 'application/vnd.github+json' };
  if (channel !== 'latest') {
    const response = await githubRequest(
      `${base}/repos/${repo}/releases/tags/${encodeURIComponent(channel)}`,
      token,
      headers
    );
    return [await response.json()];
  }
  const response = await githubRequest(
    `${base}/repos/${repo}/releases?per_page=30`,
    token,
    headers
  );
  const releases = await response.json();
  if (!Array.isArray(releases)) {
    throw new Error('GitHub вернул некорректный список релизов.');
  }
  return releases.filter((release) => !release.draft && !release.prerelease);
}

async function resolveRelease() {
  const settings = getSettings();
  // Не отправляем GitHub-токен на произвольный API-хост.
  const token = tokenAllowedFor(settings.updates.apiBase) ? getGithubToken() : null;
  const channel = normalizeChannel(settings.updates.channel);
  const releases = await fetchReleases(settings, token, channel);
  let best = null;
  for (const release of releases) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assetForPlatform(assets);
    if (!asset) continue;
    const version =
      parseVersion(asset.name) ||
      parseVersion(release.tag_name) ||
      parseVersion(release.name);
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0) {
      best = { release, asset, version };
    }
  }
  if (!best) {
    throw new Error(
      channel === 'latest'
        ? `В релизах нет файла для ${process.platform === 'win32' ? 'Windows x64' : process.platform === 'darwin' ? 'macOS' : 'этой платформы'}.`
        : 'В выбранном релизе нет подходящего установочного файла.'
    );
  }
  return { settings, token, channel, ...best };
}

async function checkForUpdates() {
  const { settings, release, asset, version: latestVersion, channel } = await resolveRelease();
  const currentVersion = app.getVersion();
  return {
    available: compareVersions(latestVersion, currentVersion) > 0,
    currentVersion,
    latestVersion,
    channel,
    repo: settings.updates.repo,
    releaseUrl: release.html_url || '',
    releaseName: release.name || '',
    publishedAt: release.published_at || '',
    notes: String(release.body || '').slice(0, 20000),
    asset: {
      name: asset.name,
      size: Number(asset.size) || 0,
      contentType: asset.content_type || '',
    },
  };
}

async function downloadUpdate(sender) {
  const { token, asset, version } = await resolveRelease();
  if (compareVersions(version, app.getVersion()) <= 0) {
    throw new Error(`Установлена последняя версия (${app.getVersion()}).`);
  }

  const updatesDir = path.join(getPaths().root, 'updates');
  await fsp.mkdir(updatesDir, { recursive: true });
  const safeName = path
    .basename(asset.name || 'update')
    .replace(/[^\w.\- ()]/g, '_')
    .slice(0, 160);
  const targetPath = path.join(updatesDir, safeName);
  const partPath = `${targetPath}.part`;
  await fsp.rm(partPath, { force: true });
  await fsp.rm(targetPath, { force: true });

  const total = Number(asset.size) || 0;
  let received = 0;
  let lastPercent = -1;
  const report = (force = false) => {
    const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
    if (!force && percent === lastPercent) return;
    lastPercent = percent;
    if (sender && !sender.isDestroyed()) {
      sender.send('updates:progress', { received, total, percent });
    }
  };

  report(true);
  const response = await githubRequest(asset.url, token, {
    accept: 'application/octet-stream',
    timeout: 600000,
  });
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      report();
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      transform,
      fs.createWriteStream(partPath)
    );
    await fsp.rename(partPath, targetPath);
    report(true);
  } catch (error) {
    await fsp.rm(partPath, { force: true }).catch(() => {});
    throw new Error(`Не удалось скачать обновление: ${error.message}`);
  }

  const stat = await fsp.stat(targetPath);
  lastDownload = {
    path: targetPath,
    name: safeName,
    version,
    size: stat.size,
  };
  return {
    name: safeName,
    version,
    size: stat.size,
    path: targetPath,
  };
}

async function installUpdate() {
  if (!lastDownload || !fs.existsSync(lastDownload.path)) {
    throw new Error('Сначала скачайте обновление.');
  }
  const error = await shell.openPath(lastDownload.path);
  if (error) {
    throw new Error(`Не удалось запустить установщик: ${error}`);
  }
  if (process.platform === 'win32') {
    setTimeout(() => app.quit(), 900);
    return { action: 'installer', version: lastDownload.version };
  }
  if (process.platform === 'darwin') {
    return { action: 'dmg', version: lastDownload.version, path: lastDownload.path };
  }
  return { action: 'file', version: lastDownload.version, path: lastDownload.path };
}

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  githubStatus,
  setGithubToken,
  clearGithubToken,
  compareVersions,
  parseVersion,
};
