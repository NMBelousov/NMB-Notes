'use strict';

const { getApiKey } = require('./secrets');
const { getSettings } = require('./settings');

const MAX_MESSAGES = 60;
const MAX_CONTENT = 240000;

function endpointFor(baseUrl) {
  const base = String(baseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) throw new Error('Некорректный список сообщений');
  let total = 0;
  const clean = [];
  for (const message of messages.slice(-MAX_MESSAGES)) {
    if (!message || typeof message.content !== 'string') continue;
    const role = ['system', 'user', 'assistant'].includes(message.role)
      ? message.role
      : 'user';
    const content = message.content.slice(0, MAX_CONTENT);
    if (!content.trim()) continue;
    total += content.length;
    if (total > MAX_CONTENT) break;
    clean.push({ role, content });
  }
  if (!clean.length) throw new Error('Пустой запрос к AI');
  return clean;
}

async function friendlyError(response) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.error?.message || data?.message || '';
  } catch {
    /* ignore */
  }
  const status = response.status;
  if (status === 401) return 'Неверный API-ключ. Проверьте ключ в настройках AI.';
  if (status === 402) return 'На балансе DeepSeek недостаточно средств.';
  if (status === 403) return 'Доступ к модели запрещён. Проверьте ключ и модель.';
  if (status === 404) return 'Модель или адрес API не найдены. Проверьте настройки.';
  if (status === 429) return 'Слишком много запросов. Подождите немного и попробуйте снова.';
  if (status >= 500) return 'Сервер DeepSeek временно недоступен. Попробуйте позже.';
  return detail ? `Ошибка API (${status}): ${detail}` : `Ошибка API (${status})`;
}

function networkError(error) {
  if (error?.name === 'AbortError') {
    return new Error('Запрос отменён');
  }
  if (error?.name === 'TimeoutError') {
    return new Error('Превышено время ожидания ответа DeepSeek');
  }
  const message = String(error?.message || error);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
    return new Error('Нет соединения с DeepSeek. Проверьте интернет и адрес API.');
  }
  return new Error(message || 'Неизвестная ошибка AI');
}

function buildBody({ messages, options = {} }, stream) {
  const settings = getSettings();
  const model =
    typeof options.model === 'string' && options.model.trim()
      ? options.model.trim().slice(0, 100)
      : settings.ai.model;
  const body = {
    model,
    messages: sanitizeMessages(messages),
    max_tokens:
      typeof options.maxTokens === 'number'
        ? Math.round(Math.min(8192, Math.max(64, options.maxTokens)))
        : settings.ai.maxTokens,
    stream,
  };
  // deepseek-reasoner не поддерживает temperature
  if (!/reasoner/i.test(model)) {
    body.temperature =
      typeof options.temperature === 'number'
        ? Math.min(2, Math.max(0, options.temperature))
        : settings.ai.temperature;
  }
  return body;
}

async function makeRequest(payload, stream, signal) {
  const key = getApiKey();
  if (!key) {
    throw new Error('API-ключ DeepSeek не добавлен. Откройте Настройки → AI.');
  }
  const settings = getSettings();
  const baseUrl = payload.baseUrl || settings.ai.baseUrl;
  const url = endpointFor(baseUrl);
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(180000) : null;
  const combined =
    timeout && AbortSignal.any ? AbortSignal.any([signal, timeout].filter(Boolean)) : signal;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(buildBody(payload, stream)),
      signal: combined || undefined,
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) {
    throw new Error(await friendlyError(response));
  }
  return response;
}

async function chat(payload) {
  const response = await makeRequest(payload, false, undefined);
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw networkError(error);
  }
  const message = data?.choices?.[0]?.message || {};
  return {
    text: typeof message.content === 'string' ? message.content : '',
    reasoning: typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
    usage: data?.usage || null,
    model: data?.model || payload?.options?.model || getSettings().ai.model,
  };
}

async function streamChat(payload, signal, onEvent) {
  const response = await makeRequest(payload, true, signal);
  if (!response.body) throw new Error('Пустой поток ответа от DeepSeek');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  let usage = null;

  const handleLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const choice = parsed?.choices?.[0];
    const delta = choice?.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content;
      onEvent?.({ type: 'chunk', text: delta.content });
    }
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      onEvent?.({ type: 'reasoning', text: delta.reasoning_content });
    }
    if (parsed?.usage) {
      usage = parsed.usage;
      onEvent?.({ type: 'usage', usage });
    }
    if (choice?.finish_reason) {
      onEvent?.({ type: 'finish', reason: choice.finish_reason });
    }
    if (parsed?.error) {
      throw new Error(parsed.error.message || 'Ошибка потока DeepSeek');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Генерация остановлена');
    throw networkError(error);
  } finally {
    reader.releaseLock();
  }
  return { text, reasoning, usage };
}

async function testConnection() {
  const started = Date.now();
  const result = await chat({
    messages: [{ role: 'user', content: 'Ответь одним словом: ok' }],
    options: { maxTokens: 8, temperature: 0 },
  });
  return {
    ok: true,
    ms: Date.now() - started,
    model: result.model,
    reply: result.text.trim().slice(0, 60),
  };
}

module.exports = { chat, streamChat, testConnection, endpointFor };
