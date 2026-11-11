import { h, clear } from '../../dom.js';
import { toast, notifyError, cleanErrorMessage } from '../../toast.js';
import { confirmDialog } from '../../modal.js';
import {
  state,
  updateSettings,
  refreshGithubStatus,
  flushNotes,
  emit,
} from '../../state.js';
import {
  section,
  note,
  field,
  toggleRow,
  actionsRow,
  button,
} from './shared.js';

const api = window.api;

export function renderUpdates({ refresh }) {
  const settings = state.settings;
  const isWindows = state.info?.platform === 'win32';
  const isMac = state.info?.platform === 'darwin';
  const wrap = h('div');
  let checkResult = state.updateInfo;
  let checking = false;

  const currentVersion = state.info?.version || '—';

  // ---------- Источник ----------
  const repoInput = h('input', {
    class: 'input',
    value: settings.updates.repo,
    spellcheck: 'false',
    onChange: (event) =>
      updateSettings({ updates: { repo: event.target.value } }).catch(notifyError),
  });
  const channelInput = h('input', {
    class: 'input',
    value: settings.updates.channel,
    spellcheck: 'false',
    onChange: (event) =>
      updateSettings({ updates: { channel: event.target.value } }).catch(notifyError),
  });
  const apiInput = h('input', {
    class: 'input',
    value: settings.updates.apiBase,
    spellcheck: 'false',
    onChange: (event) =>
      updateSettings({ updates: { apiBase: event.target.value } }).catch(notifyError),
  });

  const loadSourceSettings = async () => {
    await updateSettings({
      updates: {
        repo: repoInput.value.trim(),
        channel: channelInput.value.trim() || 'latest',
        apiBase: apiInput.value.trim() || 'https://api.github.com',
      },
    });
  };

  // ---------- Ключ GitHub ----------
  const githubStatus = state.githubStatus || {};
  const statusCard = h(
    'div',
    { class: `key-status${githubStatus.set ? ' ok' : ''}` },
    h('span', { class: 'dot' }),
    h('span', {
      text: githubStatus.set
        ? `GitHub-токен сохранён ${githubStatus.hint || ''}`
        : 'GitHub-токен не добавлен',
    }),
    h('span', {
      class: 'method',
      text: githubStatus.set
        ? `${githubStatus.cipher || ''}${githubStatus.backend ? ` · ${githubStatus.backend}` : ''}`
        : 'публичный репозиторий',
    })
  );

  const tokenInput = h('input', {
    class: 'input',
    type: 'password',
    placeholder: githubStatus.set ? 'Введите новый токен, чтобы заменить' : 'github_pat_… или ghp_…',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveToken();
  });

  const saveToken = async () => {
    const value = tokenInput.value.trim();
    if (!value) {
      toast('Введите GitHub-токен', 'warn');
      tokenInput.focus();
      return;
    }
    try {
      await api.updates.setToken(value);
      tokenInput.value = '';
      await refreshGithubStatus();
      toast('GitHub-токен сохранён');
      refresh();
    } catch (error) {
      notifyError(error);
    }
  };

  // ---------- Проверка и установка ----------
  const resultBox = h('div');
  const checkBtn = button('Проверить обновления', runCheck, {
    variant: 'primary',
    icon: 'refresh',
  });

  const progressWrap = h('div', { style: { display: 'none', marginTop: '10px' } });
  const progressBar = h('div', { class: 'update-progress' }, h('i'));
  const progressText = h('div', {
    class: 'modal-help',
    text: 'Подготовка…',
  });
  progressWrap.append(progressBar, progressText);

  function showResult(info) {
    clear(resultBox);
    if (info?.error) {
      resultBox.appendChild(note(`Не удалось проверить обновления: ${info.error}`, 'danger'));
      return;
    }
    if (!info) return;
    if (!info.available) {
      resultBox.appendChild(
        note(
          `Установлена последняя версия — ${info.currentVersion}.`,
          'success'
        )
      );
      return;
    }
    const notes = String(info.notes || '').trim();
    resultBox.appendChild(
      note(
        h(
          'div',
          {},
          h('strong', { text: `Доступно обновление ${info.latestVersion}` }),
          h('div', {
            style: { marginTop: '4px' },
            text: `Сейчас установлена ${info.currentVersion} · ${isWindows ? 'Windows x64' : isMac ? 'macOS ARM64' : 'Linux'}`,
          }),
          h('div', {
            style: { marginTop: '4px', fontSize: '10.5px', color: 'var(--text-dim)' },
            text: info.asset?.name || '',
          }),
          notes
            ? h('pre', {
                class: 'update-notes',
                text: notes.slice(0, 4000),
              })
            : null
        ),
        'warn'
      )
    );

    const downloadBtn = button(
      isWindows ? 'Скачать и установить' : 'Скачать обновление',
      async () => {
        if (downloadBtn.disabled) return;
        downloadBtn.disabled = true;
        progressWrap.style.display = 'block';
        progressBar.firstElementChild.style.width = '0%';
        progressText.textContent = 'Скачивание…';
        const unsubscribe = api.updates.onProgress(({ percent, received, total }) => {
          progressBar.firstElementChild.style.width = `${percent}%`;
          progressText.textContent = total
            ? `${percent}% · ${(received / 1024 / 1024).toFixed(1)} из ${(total / 1024 / 1024).toFixed(1)} МБ`
            : 'Скачивание…';
        });
        try {
          const file = await api.updates.download();
          progressBar.firstElementChild.style.width = '100%';
          progressText.textContent = 'Загрузка завершена';
          if (isWindows) {
            const ok = await confirmDialog({
              title: `Установить NMB Notes ${file.version}?`,
              message:
                'Запустится установщик. Приложение закроется, чтобы обновить файлы. Несохранённые изменения будут сохранены автоматически.',
              confirmLabel: 'Установить',
            });
            if (!ok) {
              progressText.textContent = 'Установщик не запущен';
              return;
            }
            await flushNotes();
            await api.updates.install();
            toast('Запускается установщик обновления');
          } else if (isMac) {
            const result = await api.updates.install();
            if (result.action === 'dmg') {
              resultBox.appendChild(
                note(
                  'DMG открыт. Перетащите NMB Notes в Applications и перезапустите приложение.',
                  'success'
                )
              );
              toast('DMG открыт');
            }
          } else {
            await api.updates.install();
            toast('Файл обновления открыт');
          }
        } catch (error) {
          progressText.textContent = '';
          resultBox.appendChild(
            note(`Ошибка обновления: ${cleanErrorMessage(error)}`, 'danger')
          );
        } finally {
          unsubscribe();
          downloadBtn.disabled = false;
        }
      },
      { icon: 'download', variant: 'primary' }
    );

    resultBox.appendChild(actionsRow(downloadBtn));
    if (info.releaseUrl) {
      resultBox.appendChild(
        actionsRow(
          button(
            'Открыть релиз на GitHub',
            () => api.app.openExternal(info.releaseUrl),
            { small: true, icon: 'external' }
          )
        )
      );
    }
  }

  async function runCheck() {
    if (checking) return;
    checking = true;
    checkBtn.disabled = true;
    clear(resultBox);
    resultBox.appendChild(note('Проверяем GitHub Releases…'));
    try {
      await loadSourceSettings();
      const info = await api.updates.check();
      state.updateInfo = info;
      state.updateError = null;
      checkResult = info;
      showResult(info);
      emit('updates:checked', info);
      if (info.available) emit('updates:available', info);
    } catch (error) {
      const message = cleanErrorMessage(error);
      state.updateInfo = null;
      state.updateError = message;
      showResult({ error: message, currentVersion });
    } finally {
      checking = false;
      checkBtn.disabled = false;
    }
  }

  // ---------- Сборка вкладки ----------
  wrap.appendChild(
    section(
      'Обновления',
      note(
        `Текущая версия: ${currentVersion}. Обновление скачивается с GitHub Releases и устанавливается из приложения.`
      ),
      actionsRow(checkBtn),
      resultBox,
      progressWrap
    )
  );

  wrap.appendChild(
    section(
      'GitHub',
      note(
        'Для приватного репозитория нужен fine-grained token с правом Contents: Read. Токен хранится зашифрованным и отправляется только на api.github.com. Для публичного репозитория токен не нужен.'
      ),
      statusCard,
      field(
        githubStatus.set ? 'Заменить токен' : 'GitHub-токен',
        'Необязательно, если репозиторий публичный',
        tokenInput,
        { wide: true }
      ),
      actionsRow(
        button('Сохранить токен', saveToken, {
          variant: 'primary',
          small: true,
          icon: 'key',
        }),
        githubStatus.set
          ? button(
              'Удалить токен',
              async () => {
                const ok = await confirmDialog({
                  title: 'Удалить GitHub-токен?',
                  message: 'Проверка обновлений приватного репозитория перестанет работать.',
                  confirmLabel: 'Удалить',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.updates.clearToken();
                  await refreshGithubStatus();
                  toast('GitHub-токен удалён');
                  refresh();
                } catch (error) {
                  notifyError(error);
                }
              },
              { small: true, icon: 'trash' }
            )
          : null,
        button(
          'GitHub Releases',
          () => api.app.openExternal(`https://github.com/${settings.updates.repo}/releases`),
          { small: true, icon: 'external' }
        )
      )
    )
  );

  wrap.appendChild(
    section(
      'Параметры',
      field('Репозиторий', 'owner/repo на GitHub', repoInput, { wide: true }),
      field('Канал / тег релиза', 'По умолчанию latest — rolling-релиз', channelInput, {
        wide: true,
      }),
      field('GitHub API URL', 'Обычно https://api.github.com', apiInput, { wide: true }),
      toggleRow(
        'Проверять при запуске',
        'Тихо проверять наличие новой версии при старте приложения',
        settings.updates.checkOnStartup,
        (value) =>
          updateSettings({ updates: { checkOnStartup: value } }).catch(notifyError)
      )
    )
  );

  wrap.appendChild(
    note(
      isWindows
        ? 'После скачивания откроется установщик, приложение закроется для обновления. Windows SmartScreen может запросить подтверждение — установщик не подписан.'
        : isMac
          ? 'После скачивания откроется DMG. Перетащите приложение в Applications. Сборка не нотаризована Apple, поэтому при первом запуске может понадобиться xattr -cr.'
          : 'После скачивания файл обновления будет открыт системой.'
    )
  );

  if (checkResult) showResult(checkResult);
  setTimeout(runCheck, 250);
  return wrap;
}
