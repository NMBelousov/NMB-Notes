import { h } from '../../dom.js';
import { toast, notifyError, cleanErrorMessage } from '../../toast.js';
import { confirmDialog } from '../../modal.js';
import {
  state,
  updateSettings,
  refreshKeyStatus,
  emit,
} from '../../state.js';
import {
  section,
  note,
  field,
  toggleRow,
  rangeRow,
  actionsRow,
  button,
} from './shared.js';

const api = window.api;

export function renderAiSettings({ refresh }) {
  const settings = state.settings;
  const status = state.aiKeyStatus || {};
  const wrap = h('div');

  const statusCard = h(
    'div',
    { class: `key-status${status.set ? ' ok' : ''}` },
    h('span', { class: 'dot' }),
    h('span', {
      text: status.set
        ? `Ключ сохранён ${status.hint || ''}`
        : 'Ключ не добавлен',
    }),
    h('span', {
      class: 'method',
      text: status.set ? `${status.cipher || ''}${status.backend ? ` · ${status.backend}` : ''}` : '—',
    })
  );

  const keyInput = h('input', {
    class: 'input',
    type: 'password',
    placeholder: status.set ? 'Введите новый ключ, чтобы заменить' : 'sk-…',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const resultNote = h('div', {
    class: 'settings-note',
    style: { display: 'none' },
  });

  const saveKey = async () => {
    const value = keyInput.value.trim();
    if (!value) {
      toast('Введите API-ключ', 'warn');
      keyInput.focus();
      return;
    }
    try {
      await api.ai.setKey(value);
      keyInput.value = '';
      await refreshKeyStatus();
      toast('Ключ сохранён и зашифрован');
      refresh();
    } catch (error) {
      notifyError(error);
    }
  };

  keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveKey();
  });

  const testBtn = button(
    'Проверить подключение',
    async () => {
      if (!state.aiKeyStatus?.set) {
        toast('Сначала сохраните ключ', 'warn');
        return;
      }
      testBtn.disabled = true;
      const original = testBtn.querySelector('span');
      if (original) original.textContent = 'Проверяем…';
      resultNote.style.display = 'none';
      try {
        const result = await api.ai.test();
        resultNote.className = 'settings-note success';
        resultNote.textContent = `Подключение работает · ${result.model} · ${result.ms} мс${result.reply ? ` · ответ: ${result.reply}` : ''}`;
        resultNote.style.display = 'block';
        toast('DeepSeek отвечает');
      } catch (error) {
        resultNote.className = 'settings-note danger';
        resultNote.textContent = cleanErrorMessage(error);
        resultNote.style.display = 'block';
      } finally {
        testBtn.disabled = false;
        if (original) original.textContent = 'Проверить подключение';
      }
    },
    { icon: 'refresh' }
  );

  wrap.appendChild(
    section(
      'API-ключ DeepSeek',
      statusCard,
      note(
        'Ключ хранится только в зашифрованном виде. На macOS и Windows используется системное хранилище (Keychain / DPAPI) через Electron safeStorage. Если оно недоступно, применяется AES-256-GCM с локальным ключом и правами 600. Ключ никогда не попадает в renderer, логи или файлы заметок.'
      ),
      field(
        status.set ? 'Заменить ключ' : 'API-ключ',
        'Получите ключ на platform.deepseek.com → API keys',
        keyInput,
        { wide: true }
      ),
      actionsRow(
        button('Сохранить ключ', saveKey, {
          variant: 'primary',
          small: true,
          icon: 'key',
        }),
        testBtn,
        status.set
          ? button(
              'Удалить ключ',
              async () => {
                const ok = await confirmDialog({
                  title: 'Удалить API-ключ?',
                  message: 'AI-помощник перестанет работать, пока вы не добавите ключ снова.',
                  confirmLabel: 'Удалить',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.ai.clearKey();
                  await refreshKeyStatus();
                  toast('Ключ удалён');
                  refresh();
                } catch (error) {
                  notifyError(error);
                }
              },
              { small: true, icon: 'trash' }
            )
          : null,
        button('DeepSeek Platform', () => api.app.openExternal('https://platform.deepseek.com'), {
          small: true,
          icon: 'external',
        })
      ),
      resultNote
    )
  );

  const models = h('datalist', { id: 'deepseek-models' });
  models.append(
    h('option', { value: 'deepseek-chat' }),
    h('option', { value: 'deepseek-reasoner' })
  );
  const modelInput = h('input', {
    class: 'input',
    value: settings.ai.model,
    list: 'deepseek-models',
    spellcheck: 'false',
    onChange: (event) => {
      const value = event.target.value.trim() || 'deepseek-chat';
      updateSettings({ ai: { model: value } })
        .then(() => toast(`Модель: ${value}`))
        .catch(notifyError);
    },
  });

  const baseInput = h('input', {
    class: 'input',
    value: settings.ai.baseUrl,
    spellcheck: 'false',
    onChange: (event) => {
      updateSettings({ ai: { baseUrl: event.target.value } })
        .then(() => toast('Адрес API обновлён'))
        .catch(notifyError);
    },
  });

  const maxTokensInput = h('input', {
    class: 'input',
    type: 'number',
    min: '64',
    max: '8192',
    step: '64',
    value: String(settings.ai.maxTokens),
    onChange: (event) => {
      const value = Number(event.target.value);
      updateSettings({ ai: { maxTokens: value } }).catch(notifyError);
    },
  });

  wrap.appendChild(
    section(
      'Модель и параметры',
      field(
        'Модель',
        'deepseek-chat — быстрая; deepseek-reasoner — с рассуждениями',
        h('div', {}, modelInput, models),
        { wide: true }
      ),
      field(
        'Базовый URL',
        'Можно указать совместимый OpenAI-эндпоинт. HTTP разрешён только для localhost.',
        baseInput,
        { wide: true }
      ),
      rangeRow({
        label: 'Температура',
        desc: 'Ниже — точнее, выше — креативнее',
        min: 0,
        max: 2,
        step: 0.1,
        value: settings.ai.temperature,
        format: (value) => Number(value).toFixed(1),
        onChange: (value) => updateSettings({ ai: { temperature: value } }).catch(notifyError),
      }),
      field(
        'Максимум токенов',
        'Размер ответа. 2048 токенов ≈ 1500 слов.',
        maxTokensInput,
        { wide: true }
      ),
      toggleRow(
        'Контекст активной заметки',
        'Отправлять текст заметки вместе с запросом. Отключите для приватности.',
        settings.ai.includeContext,
        (value) => updateSettings({ ai: { includeContext: value } }).catch(notifyError)
      ),
      toggleRow(
        'Потоковый ответ',
        'Показывать текст по мере генерации',
        settings.ai.stream,
        (value) => updateSettings({ ai: { stream: value } }).catch(notifyError)
      )
    )
  );

  wrap.appendChild(
    note(
      'AI используется только когда вы отправляете запрос. Приложение не отправляет телеметрию и не загружает заметки автоматически. Запросы идут напрямую на api.deepseek.com (или указанный вами адрес).'
    )
  );

  wrap.appendChild(
    actionsRow(
      button('Открыть AI-панель', () => {
        emit('ai:toggle');
      }, { icon: 'ai' })
    )
  );

  return wrap;
}
