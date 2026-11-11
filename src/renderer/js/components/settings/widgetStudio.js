import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { toast, cleanErrorMessage } from '../../toast.js';
import { openModal, docModal } from '../../modal.js';
import { state, updateSettings } from '../../state.js';
import { WIDGET_GUIDE } from '../../widgets/ai-guide.js';
import { renderMarkdown } from '../../markdown.js';
import { reloadWidgets, widgetErrors } from '../../widgets/registry.js';

const api = window.api;

const TEMPLATE = `// NMB Notes widget — экспорт по умолчанию
export default {
  id: 'my-widget',
  name: 'Мой виджет',
  description: 'Короткое описание',
  icon: '✨',
  version: '1.0.0',
  render(container, ctx) {
    const note = ctx.getNote();
    container.textContent = note?.title || 'Нет заметки';
    const off = ctx.on('note:changed', () => {
      container.textContent = ctx.getNote()?.title || '';
    });
    return () => off();
  },
};
`;

export function openWidgetGuide() {
  const html = renderMarkdown(WIDGET_GUIDE);
  docModal({ title: 'Руководство по виджетам', html });
}

export async function openInstallWidget(refresh) {
  let template = TEMPLATE;
  try {
    template = await api.widgets.template();
  } catch {
    /* fallback */
  }
  const idInput = h('input', {
    class: 'input',
    placeholder: 'my-widget',
    value: 'my-widget',
    spellcheck: 'false',
  });
  const codeArea = h('textarea', {
    class: 'textarea studio-code',
    spellcheck: 'false',
  });
  codeArea.value = template;
  const error = h('div', { class: 'studio-error', style: { display: 'none' } });
  let modal;
  modal = openModal({
    title: 'Установить виджет из кода',
    wide: true,
    body: h(
      'div',
      {},
      h(
        'div',
        { class: 'modal-field' },
        h('label', { text: 'ID виджета (латиница, дефис, подчёркивание)' }),
        idInput
      ),
      h(
        'div',
        { class: 'modal-field' },
        h('label', { text: 'JavaScript (ES-модуль с export default)' }),
        codeArea
      ),
      h('div', {
        class: 'modal-help',
        text: 'Только доверенный код: виджет выполняется внутри приложения и имеет доступ к интерфейсу. Node.js API запрещены.',
      }),
      error
    ),
    footer: h(
      'div',
      { class: 'modal-foot' },
      h(
        'button',
        { class: 'btn', onClick: () => openWidgetGuide() },
        'Руководство'
      ),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onClick: () => modal.close() }, 'Отмена'),
      h(
        'button',
        {
          class: 'btn primary',
          onClick: async () => {
            error.style.display = 'none';
            const id = idInput.value.trim();
            if (!/^[a-z0-9][a-z0-9-_]{0,48}$/.test(id)) {
              error.textContent =
                'ID: только строчная латиница, цифры, дефис и подчёркивание, до 49 символов.';
              error.style.display = 'block';
              return;
            }
            try {
              await api.widgets.save({ id, source: codeArea.value });
              await reloadWidgets();
              const enabled = state.settings.widgets.enabled.slice();
              if (!enabled.includes(id)) {
                enabled.push(id);
                await updateSettings({ widgets: { enabled } });
              }
              toast(`Виджет «${id}» установлен`);
              modal.close();
              refresh?.();
            } catch (saveError) {
              error.textContent = cleanErrorMessage(saveError);
              error.style.display = 'block';
            }
          },
        },
        'Установить'
      )
    ),
  });
}

export function openWidgetStudio(refresh) {
  const promptArea = h('textarea', {
    class: 'textarea',
    style: { minHeight: '90px' },
    placeholder:
      'Например: виджет с таймером обратного отсчёта до дедлайна, который хранит дату в localStorage',
  });
  const status = h('div', { class: 'studio-progress', style: { display: 'none' } });
  const statusText = h('span');
  status.appendChild(h('div', { class: 'spinner' }));
  status.appendChild(statusText);
  const error = h('div', { class: 'studio-error', style: { display: 'none' } });
  const codeArea = h('textarea', {
    class: 'textarea studio-code',
    spellcheck: 'false',
  });
  const idInput = h('input', {
    class: 'input',
    spellcheck: 'false',
    placeholder: 'ai-widget',
  });
  const codeBlock = h(
    'div',
    { style: { display: 'none' } },
    h(
      'div',
      { class: 'modal-field', style: { marginTop: '12px' } },
      h('label', { text: 'ID виджета' }),
      idInput
    ),
    h(
      'div',
      { class: 'modal-field' },
      h('label', { text: 'Код (можно отредактировать перед установкой)' }),
      codeArea
    )
  );

  const generateBtn = h(
    'button',
    { class: 'btn primary', type: 'button' },
    icon('sparkle'),
    h('span', { text: 'Сгенерировать' })
  );
  const installBtn = h(
    'button',
    { class: 'btn ghost', type: 'button', disabled: true },
    icon('plus'),
    h('span', { text: 'Установить' })
  );

  let modal;
  modal = openModal({
    title: 'Создать виджет с AI',
    wide: true,
    body: h(
      'div',
      {},
      h(
        'div',
        { class: 'modal-field' },
        h('label', { text: 'Что должен делать виджет?' }),
        promptArea
      ),
      h(
        'div',
        { class: 'modal-help', text: 'AI получит документацию по API виджетов и вернёт ES-модуль. Проверьте код перед установкой.' }
      ),
      status,
      h('div', { style: { marginTop: '10px' } }, generateBtn),
      codeBlock,
      error
    ),
    footer: h(
      'div',
      { class: 'modal-foot' },
      h(
        'button',
        { class: 'btn', onClick: () => openWidgetGuide() },
        'API виджетов'
      ),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onClick: () => modal.close() }, 'Закрыть'),
      installBtn
    ),
  });

  generateBtn.addEventListener('click', async () => {
    const prompt = promptArea.value.trim();
    error.style.display = 'none';
    if (!prompt) {
      promptArea.focus();
      return;
    }
    if (!state.aiKeyStatus?.set) {
      error.textContent = 'Сначала добавьте API-ключ DeepSeek в настройках AI.';
      error.style.display = 'block';
      return;
    }
    generateBtn.disabled = true;
    status.style.display = 'flex';
    statusText.textContent = 'AI пишет виджет… это может занять 10–30 секунд';
    codeBlock.style.display = 'none';
    installBtn.disabled = true;
    try {
      const result = await api.ai.chat({
        messages: [
          { role: 'system', content: WIDGET_GUIDE },
          {
            role: 'user',
            content: `Создай виджет по описанию. Верни ТОЛЬКО JavaScript-код без markdown-обёртки, начиная с export default. Не используй внешние импорты и сеть.\n\nОписание: ${prompt}`,
          },
        ],
        options: { temperature: 0.35, maxTokens: 3000 },
      });
      const raw = (result.text || '').trim();
      const fence = raw.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
      let code = fence ? fence[1].trim() : raw;
      if (!/export\s+default/.test(code)) {
        throw new Error('AI не вернул ES-модуль с export default. Попробуйте переформулировать запрос.');
      }
      const idMatch = code.match(/id:\s*['"]([a-z0-9-_]+)['"]/i);
      const id =
        idMatch && /^[a-z0-9][a-z0-9-_]{0,48}$/.test(idMatch[1])
          ? idMatch[1]
          : `ai-widget-${Date.now().toString(36)}`;
      codeArea.value = code;
      idInput.value = id;
      codeBlock.style.display = 'block';
      installBtn.disabled = false;
      status.style.display = 'none';
    } catch (generateError) {
      status.style.display = 'none';
      error.textContent = cleanErrorMessage(generateError);
      error.style.display = 'block';
    } finally {
      generateBtn.disabled = false;
    }
  });

  installBtn.addEventListener('click', async () => {
    error.style.display = 'none';
    const id = idInput.value.trim();
    if (!/^[a-z0-9][a-z0-9-_]{0,48}$/.test(id)) {
      error.textContent = 'Некорректный ID виджета';
      error.style.display = 'block';
      return;
    }
    if (!/export\s+default/.test(codeArea.value)) {
      error.textContent = 'Код должен содержать export default';
      error.style.display = 'block';
      return;
    }
    installBtn.disabled = true;
    try {
      await api.widgets.save({ id, source: codeArea.value });
      await reloadWidgets();
      const failed = widgetErrors().find((entry) => entry.fileId === id);
      if (failed) {
        throw new Error(`Код сохранён, но не загрузился: ${failed.message}`);
      }
      const enabled = state.settings.widgets.enabled.slice();
      if (!enabled.includes(id)) {
        enabled.push(id);
        await updateSettings({ widgets: { enabled } });
      }
      toast(`Виджет «${id}» установлен и включён`);
      modal.close();
      refresh?.();
    } catch (installError) {
      error.textContent = cleanErrorMessage(installError);
      error.style.display = 'block';
      installBtn.disabled = false;
    }
  });
}
