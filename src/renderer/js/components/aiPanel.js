import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { toast, notifyError, cleanErrorMessage } from '../toast.js';
import { renderMarkdown } from '../markdown.js';
import { state, on, emit, activeNote, updateSettings } from '../state.js';

const api = window.api;

const SYSTEM_PROMPT =
  'Ты — AI-помощник внутри приложения NMB Notes для работы с заметками. Отвечай на языке пользователя, кратко и по делу, в формате Markdown. Не начинай с фраз вроде «Конечно!» или «Вот». Если пользователь просит изменить текст — давай готовый вариант. Если не хватает контекста — задай один короткий уточняющий вопрос.';

const CHIPS = [
  {
    label: 'Резюме',
    prompt:
      'Сделай краткое резюме этой заметки: 3–6 ключевых пунктов. Верни готовый Markdown.',
  },
  {
    label: 'Задачи',
    prompt:
      'Преврати содержание этой заметки в чек-лист конкретных задач. Верни только Markdown-список "- [ ] ...".',
  },
  {
    label: 'Продолжить',
    prompt:
      'Продолжи текст этой заметки на 1–2 абзаца в том же стиле. Верни только продолжение.',
  },
  {
    label: 'Улучшить',
    prompt:
      'Предложи, как улучшить эту заметку: структура, ясность, формулировки. Покажи конкретные правки.',
  },
  {
    label: 'Сократить',
    prompt:
      'Сократи текст этой заметки на 30–40%, сохранив ключевые мысли и смысл.',
  },
];

export function mountAiPanel(panel) {
  const messages = [];
  let streaming = false;
  let controller = null;
  let runId = 0;
  let streamState = null;
  let paintTimer = null;
  let pendingAutoSend = false;
  let pendingInsert = false;

  // ---------- Разметка ----------
  const modelBadge = h('span', { class: 'ai-model-badge', text: state.settings?.ai?.model || 'deepseek-chat' });
  const head = h(
    'div',
    { class: 'ai-head' },
    h('div', { class: 'ai-logo', html: icon('ai').innerHTML }),
    h(
      'div',
      { class: 'ai-head-text' },
      h('h2', {}, 'AI-помощник', modelBadge),
      h('div', { class: 'ai-head-sub', text: 'DeepSeek · ключ хранится локально' })
    ),
    h(
      'button',
      {
        class: 'btn icon-only',
        title: 'Новый чат',
        'aria-label': 'Новый чат',
        onClick: () => resetChat(),
      },
      icon('refresh')
    ),
    h(
      'button',
      {
        class: 'btn icon-only',
        title: 'Закрыть (Esc)',
        'aria-label': 'Закрыть',
        onClick: () => close(),
      },
      icon('close')
    )
  );

  const contextToggle = h('input', { type: 'checkbox' });
  contextToggle.checked = state.settings?.ai?.includeContext !== false;
  contextToggle.addEventListener('change', () => {
    updateSettings({ ai: { includeContext: contextToggle.checked } }).catch(notifyError);
  });
  const contextName = h('span', { class: 'muted' });
  const contextBar = h(
    'div',
    { class: 'ai-context-bar' },
    h(
      'label',
      { class: 'check', title: 'Отправлять текст активной заметки вместе с запросом' },
      contextToggle,
      h('span', { text: 'Контекст заметки' })
    ),
    contextName,
    h('span', { class: 'spacer' }),
    h(
      'button',
      {
        class: 'link-button',
        text: 'Настройки AI',
        onClick: () => emit('ui:open-settings', { tab: 'ai' }),
      }
    )
  );

  const messagesEl = h('div', { class: 'ai-messages' });
  const chipsEl = h(
    'div',
    { class: 'ai-chips' },
    CHIPS.map((chip) =>
      h(
        'button',
        {
          class: 'ai-chip',
          type: 'button',
          title: chip.prompt,
          onClick: () => {
            if (!state.aiKeyStatus?.set) {
              emit('ui:open-settings', { tab: 'ai' });
              toast('Сначала добавьте API-ключ DeepSeek', 'warn');
              return;
            }
            input.value = chip.prompt;
            autoGrow();
            send();
          },
        },
        chip.label
      )
    )
  );
  const input = h('textarea', {
    class: 'ai-input',
    rows: 1,
    placeholder: 'Спросите что-нибудь о заметке…',
    'aria-label': 'Сообщение AI',
    onInput: () => autoGrow(),
    onKeydown: (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send();
      }
    },
  });
  const sendBtn = h(
    'button',
    {
      class: 'ai-send',
      title: 'Отправить (Enter)',
      'aria-label': 'Отправить',
      onClick: () => (streaming ? stop() : send()),
    },
    icon('send')
  );
  const hint = h('div', { class: 'ai-hint' });
  const hintLeft = h('span', { text: 'Enter — отправить · Shift+Enter — новая строка' });
  const hintRight = h('span');
  hint.append(hintLeft, hintRight);

  const keyNotice = h('div', { class: 'ai-key-notice' });
  const compose = h(
    'div',
    { class: 'ai-compose' },
    chipsEl,
    h('div', { class: 'ai-input-row' }, input, sendBtn),
    hint,
    keyNotice
  );

  clear(panel);
  panel.append(head, contextBar, messagesEl, compose);

  // ---------- Вспомогательные ----------
  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(150, input.scrollHeight)}px`;
  };

  const updateSendButton = () => {
    clear(sendBtn);
    sendBtn.appendChild(icon(streaming ? 'stop' : 'send'));
    sendBtn.classList.toggle('stop', streaming);
    sendBtn.title = streaming ? 'Остановить генерацию' : 'Отправить (Enter)';
    sendBtn.setAttribute('aria-label', streaming ? 'Остановить' : 'Отправить');
  };

  const scrollToBottom = () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const updateKeyUi = () => {
    const ready = Boolean(state.aiKeyStatus?.set);
    clear(keyNotice);
    if (!ready) {
      keyNotice.appendChild(
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', {
            style: { flex: '1' },
            text: 'API-ключ DeepSeek не добавлен. Ключ хранится зашифрованным и не покидает устройство.',
          }),
          h(
            'button',
            {
              class: 'btn primary small',
              onClick: () => emit('ui:open-settings', { tab: 'ai' }),
            },
            'Добавить ключ'
          )
        )
      );
      keyNotice.style.display = 'block';
    } else {
      keyNotice.style.display = 'none';
    }
    sendBtn.disabled = false;
    hintLeft.textContent = ready
      ? 'Enter — отправить · Shift+Enter — новая строка'
      : 'Добавьте ключ в настройках AI';
    modelBadge.textContent = state.settings?.ai?.model || 'deepseek-chat';
  };

  const updateContextName = () => {
    const note = activeNote();
    contextName.textContent = note ? `«${note.title}»` : 'нет заметки';
  };

  // ---------- Рендер сообщений ----------
  const welcome = () => {
    const ready = state.aiKeyStatus?.set;
    return h(
      'div',
      { class: 'ai-welcome' },
      h('strong', { text: 'Чем помочь?' }),
      h('div', {
        style: { marginTop: '4px' },
        text: ready
          ? 'Попросите резюме, план задач, продолжение текста или задайте любой вопрос. Контекст заметки можно отключить выше.'
          : 'Добавьте API-ключ DeepSeek в настройках — и панель заработает. Без ключа запросы не отправляются.',
      })
    );
  };

  const renderMessage = (message, index) => {
    if (message.role === 'user') {
      return h('div', { class: 'ai-msg user', text: message.content });
    }
    if (message.role === 'error') {
      return h(
        'div',
        { class: 'ai-msg error' },
        h('div', { style: { display: 'flex', gap: '7px', alignItems: 'flex-start' } },
          icon('warning'),
          h('div', { text: message.content })
        ),
        message.hint
          ? h(
              'button',
              {
                class: 'btn ghost small',
                style: { marginTop: '7px' },
                onClick: () => emit('ui:open-settings', { tab: 'ai' }),
              },
              message.hint
            )
          : null
      );
    }
    const bubble = h('div', { class: 'ai-msg assistant' });
    if (message.reasoning) {
      bubble.appendChild(
        h('div', { class: 'ai-reasoning', text: message.reasoning })
      );
    }
    const md = h('div', { class: 'md', html: renderMarkdown(message.content || '') });
    bubble.appendChild(md);
    if (!message.streaming) {
      const actions = h(
        'div',
        { class: 'ai-msg-actions' },
        h(
          'button',
          {
            class: 'btn',
            title: 'Добавить ответ в конец заметки',
            onClick: () => {
              emit('editor:insert', { text: message.content, mode: 'end' });
              toast('Добавлено в конец заметки');
            },
          },
          icon('arrowRight'),
          'Вставить'
        ),
        h(
          'button',
          {
            class: 'btn',
            onClick: async () => {
              await api.app.copyText(message.content);
              toast('Скопировано');
            },
          },
          icon('copy'),
          'Копировать'
        )
      );
      bubble.appendChild(actions);
    }
    bubble.dataset.index = String(index);
    return bubble;
  };

  const renderAll = () => {
    clear(messagesEl);
    if (!messages.length) {
      messagesEl.appendChild(welcome());
      return;
    }
    messages.forEach((message, index) => {
      messagesEl.appendChild(renderMessage(message, index));
    });
    scrollToBottom();
  };

  const paintStream = () => {
    if (!streamState) return;
    const bubble = messagesEl.querySelector(
      `.ai-msg.assistant[data-index="${streamState.index}"]`
    );
    if (!bubble) return;
    let reasoning = bubble.querySelector('.ai-reasoning');
    if (streamState.reasoning && !reasoning) {
      reasoning = h('div', { class: 'ai-reasoning' });
      bubble.insertBefore(reasoning, bubble.firstChild);
    }
    if (reasoning) {
      reasoning.textContent = streamState.reasoning;
      reasoning.scrollTop = reasoning.scrollHeight;
    }
    const md = bubble.querySelector('.md');
    if (md) md.innerHTML = renderMarkdown(streamState.content || '');
    scrollToBottom();
  };

  const schedulePaint = () => {
    if (paintTimer) return;
    paintTimer = setTimeout(() => {
      paintTimer = null;
      paintStream();
    }, 70);
  };

  // ---------- Отправка ----------
  const buildPayload = (history) => {
    const payload = [{ role: 'system', content: SYSTEM_PROMPT }];
    const note = activeNote();
    if (state.settings?.ai?.includeContext !== false && note) {
      payload.push({
        role: 'system',
        content: `Текущая заметка «${note.title}»:\n\n${note.body.slice(0, 14000)}`,
      });
    }
    for (const message of history) {
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      if (!message.content?.trim()) continue;
      payload.push({ role: message.role, content: message.content });
    }
    // Схлопываем подряд идущие сообщения одной роли
    const compact = [];
    for (const message of payload) {
      const last = compact[compact.length - 1];
      if (last && last.role === message.role && message.role !== 'system') {
        last.content += `\n\n${message.content}`;
      } else {
        compact.push({ ...message });
      }
    }
    return compact;
  };

  const send = () => {
    if (streaming) return;
    const text = input.value.trim();
    if (!text) return;
    if (!state.aiKeyStatus?.set) {
      emit('ui:open-settings', { tab: 'ai' });
      toast('Сначала добавьте API-ключ DeepSeek', 'warn');
      return;
    }
    input.value = '';
    autoGrow();
    messages.push({ role: 'user', content: text });
    const assistant = {
      role: 'assistant',
      content: '',
      reasoning: '',
      streaming: true,
    };
    messages.push(assistant);
    renderAll();
    streaming = true;
    updateSendButton();
    hintRight.textContent = 'Генерация…';
    hintRight.classList.remove('err');

    const history = messages
      .slice(0, -1)
      .slice(-24)
      .map((message) => ({ role: message.role, content: message.content }));
    const payload = buildPayload(history);
    const assistantIndex = messages.length - 1;
    const shouldInsert = pendingInsert;
    pendingInsert = false;
    streamState = {
      index: assistantIndex,
      content: '',
      reasoning: '',
      message: assistant,
    };
    const run = ++runId;

    if (state.settings?.ai?.stream === false) {
      controller = { cancel: () => {} };
      api.ai
        .chat({
          messages: payload,
          options: {
            model: state.settings?.ai?.model,
            temperature: state.settings?.ai?.temperature,
            maxTokens: state.settings?.ai?.maxTokens,
          },
        })
        .then((result) => {
          if (run !== runId) return;
          assistant.content = result.text || '';
          assistant.reasoning = result.reasoning || '';
          assistant.streaming = false;
          finishStream(shouldInsert);
        })
        .catch((error) => {
          if (run !== runId) return;
          failStream(cleanErrorMessage(error));
        });
      return;
    }

    controller = api.ai.stream(
      {
        messages: payload,
        options: {
          model: state.settings?.ai?.model,
          temperature: state.settings?.ai?.temperature,
          maxTokens: state.settings?.ai?.maxTokens,
        },
      },
      (event) => {
        if (run !== runId) return;
        if (event.type === 'chunk') {
          streamState.content += event.text;
          assistant.content = streamState.content;
          schedulePaint();
        } else if (event.type === 'reasoning') {
          streamState.reasoning += event.text;
          assistant.reasoning = streamState.reasoning;
          schedulePaint();
        } else if (event.type === 'done') {
          if (event.text && !streamState.content) {
            streamState.content = event.text;
            assistant.content = event.text;
          }
          finishStream(shouldInsert);
        } else if (event.type === 'error') {
          failStream(event.message);
        }
      }
    );
  };

  const finishStream = (insertIntoNote = false) => {
    streaming = false;
    controller = null;
    streamState = null;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') last.streaming = false;
    updateSendButton();
    hintRight.textContent = '';
    renderAll();
    if (insertIntoNote && last?.content?.trim()) {
      emit('editor:insert', { text: `${last.content.trim()}\n`, mode: 'end' });
      toast('Результат добавлен в конец заметки');
    }
  };

  const failStream = (message) => {
    const partial = messages[messages.length - 1];
    if (partial && partial.role === 'assistant' && !partial.content) {
      messages.pop();
    } else if (partial?.role === 'assistant') {
      partial.streaming = false;
    }
    messages.push({
      role: 'error',
      content: message || 'Не удалось получить ответ',
      hint: /ключ/i.test(message || '') ? 'Проверить ключ' : null,
    });
    streaming = false;
    controller = null;
    streamState = null;
    updateSendButton();
    hintRight.textContent = '';
    renderAll();
  };

  const stop = () => {
    if (!streaming) return;
    const partial = messages[messages.length - 1];
    const hadContent = Boolean(partial?.content);
    runId += 1;
    try {
      controller?.cancel();
    } catch {
      /* ignore */
    }
    controller = null;
    streaming = false;
    streamState = null;
    if (partial && partial.role === 'assistant') {
      if (!hadContent) messages.pop();
      else partial.streaming = false;
    }
    updateSendButton();
    hintRight.textContent = 'Остановлено';
    renderAll();
  };

  const resetChat = () => {
    if (streaming) stop();
    messages.length = 0;
    pendingInsert = false;
    renderAll();
    input.focus();
  };

  // ---------- Открытие / закрытие ----------
  const open = ({ prompt = '', autoSend = false, autoInsert = false } = {}) => {
    emit('settings:close');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    state.aiOpen = true;
    emit('ai:state', { open: true });
    updateKeyUi();
    updateContextName();
    if (prompt) {
      input.value = prompt;
      autoGrow();
    }
    pendingAutoSend = autoSend && Boolean(prompt) && Boolean(state.aiKeyStatus?.set);
    pendingInsert = Boolean(autoInsert) && pendingAutoSend;
    if (pendingAutoSend && state.aiKeyStatus?.set) {
      setTimeout(() => {
        if (pendingAutoSend) {
          pendingAutoSend = false;
          send();
        }
      }, 60);
    }
    setTimeout(() => input.focus(), 80);
  };

  const close = () => {
    if (streaming) stop();
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    state.aiOpen = false;
    emit('ai:state', { open: false });
  };

  const toggle = () => {
    if (panel.classList.contains('open')) close();
    else open();
  };

  on('ai:open', (payload) => open(payload || {}));
  on('ai:toggle', toggle);
  on('ai:close', close);
  on('ai:key-changed', () => {
    updateKeyUi();
    if (state.aiKeyStatus?.set && pendingAutoSend) {
      pendingAutoSend = false;
      send();
    }
    renderAll();
  });
  on('note:selected', () => {
    updateContextName();
  });
  on('note:changed', () => {
    updateContextName();
  });
  on('settings:changed', (settings) => {
    modelBadge.textContent = settings.ai.model;
    contextToggle.checked = settings.ai.includeContext !== false;
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  });

  updateKeyUi();
  updateContextName();
  updateSendButton();
  renderAll();
}
