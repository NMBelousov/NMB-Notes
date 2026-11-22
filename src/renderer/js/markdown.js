/**
 * Минимальный, но безопасный Markdown-рендерер.
 * HTML из заметок никогда не вставляется как разметка — только экранированный текст.
 * Поддерживает: заголовки, списки, чек-листы, цитаты, код, таблицы, ссылки,
 * wiki-ссылки [[...]], изображения, выделение, встроенные виджеты ::widget[id].
 */

import { escapeAttr, escapeHtml } from './dom.js';
import { indentWidth, parseListLine } from './lists.js';

const LINK_RE = /^(https?:\/\/|mailto:|#)/i;
const IMAGE_RE = /^(https?:\/\/|data:image\/)/i;

function inlineFormat(raw) {
  const stash = [];
  const keep = (html) => `\u0000H${stash.push(html) - 1}\u0000`;

  let text = escapeHtml(raw);

  // Инлайн-код прячем первым, чтобы внутри не работала разметка.
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => keep(`<code>${code}</code>`));

  // Изображения
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
    if (!IMAGE_RE.test(url)) return match;
    return keep(
      `<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`
    );
  });

  // Wiki-ссылки
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
    const title = target.trim();
    if (!title) return _match;
    return keep(
      `<a href="#" class="wikilink" data-wiki="${escapeAttr(title)}">${alias || target}</a>`
    );
  });

  // Обычные ссылки
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    if (!LINK_RE.test(url)) return match;
    const external = /^https?:/i.test(url);
    return keep(
      `<a href="${url}"${external ? ' data-external="1"' : ''}>${label}</a>`
    );
  });

  // Выделение
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // Возвращаем сохранённые фрагменты (могут быть вложены — повторяем).
  for (let guard = 0; guard < 5 && text.includes('\u0000H'); guard += 1) {
    text = text.replace(/\u0000H(\d+)\u0000/g, (_m, index) => stash[Number(index)] ?? '');
  }
  return text;
}

function isSeparatorRow(line) {
  if (!line || !line.includes('|')) return false;
  let cells = line.trim().split('|').map((cell) => cell.trim());
  if (cells[0] === '') cells = cells.slice(1);
  if (cells[cells.length - 1] === '') cells = cells.slice(0, -1);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
  let cells = line.trim().split('|').map((cell) => cell.trim());
  if (line.trim().startsWith('|')) cells = cells.slice(1);
  if (line.trim().endsWith('|')) cells = cells.slice(0, -1);
  return cells;
}

/**
 * Собирает дерево вложенных списков по отступам.
 * Смена типа списка на одном уровне создаёт соседний список, как в Markdown.
 */
function buildListTree(items) {
  const roots = [];
  const stack = [];

  for (const item of items) {
    while (stack.length && item.indent < stack[stack.length - 1].indent) {
      stack.pop();
    }

    let container = stack[stack.length - 1];
    if (!container || item.indent > container.indent) {
      const list = {
        indent: item.indent,
        ordered: item.ordered,
        start: item.number || 1,
        items: [],
      };
      if (container && container.items.length) {
        container.items[container.items.length - 1].children.push(list);
      } else {
        roots.push(list);
      }
      stack.push(list);
      container = list;
    } else if (container.ordered !== item.ordered) {
      stack.pop();
      const parent = stack[stack.length - 1];
      const list = {
        indent: item.indent,
        ordered: item.ordered,
        start: item.number || 1,
        items: [],
      };
      if (parent && parent.items.length) {
        parent.items[parent.items.length - 1].children.push(list);
      } else {
        roots.push(list);
      }
      stack.push(list);
      container = list;
    }

    container.items.push({
      content: item.content,
      task: item.task,
      checked: item.checked,
      line: item.line,
      children: [],
    });
  }

  return roots;
}

function renderListTree(list, opts) {
  const tag = list.ordered ? 'ol' : 'ul';
  const start =
    list.ordered && Number.isFinite(list.start) && list.start !== 1
      ? ` start="${list.start}"`
      : '';
  const items = list.items
    .map((item) => {
      const children = item.children.map((child) => renderListTree(child, opts)).join('');
      if (item.task) {
        const checkbox = opts.taskLine
          ? `<input type="checkbox" class="task-checkbox" data-line="${item.line}"${
              item.checked ? ' checked' : ''
            } aria-label="Отметить задачу">`
          : `<input type="checkbox" class="task-checkbox"${
              item.checked ? ' checked' : ''
            } disabled>`;
        return `<li class="task-item">${checkbox}<span>${inlineFormat(
          item.content
        )}</span>${children}</li>`;
      }
      return `<li>${inlineFormat(item.content)}${children}</li>`;
    })
    .join('');
  return `<${tag}${start}>${items}</${tag}>`;
}

function isBlockStart(line) {
  return (
    /^\s*(#{1,6})\s+/.test(line) ||
    /^\s*(```|~~~)/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*([-*+]|\d+\.)\s+/.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*::widget\[[a-zA-Z0-9_-]+\]/.test(line)
  );
}

export function renderMarkdown(source, options = {}) {
  const opts = {
    widgets: true,
    wiki: true,
    taskLine: true,
    headingIds: true,
    ...options,
  };
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out = [];
  let index = 0;

  const flushParagraph = (buffer) => {
    if (!buffer.length) return;
    out.push(`<p>${inlineFormat(buffer.join('\n')).replace(/\n/g, '<br>')}</p>`);
    buffer.length = 0;
  };

  const paragraph = [];

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph(paragraph);
      const marker = fence[1][0];
      const lang = (fence[2] || 'text').replace(/[^\w-]/g, '') || 'text';
      index += 1;
      const code = [];
      while (
        index < lines.length &&
        !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])
      ) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      out.push(
        `<pre><code class="language-${lang}">${escapeHtml(code.join('\n'))}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      const id = opts.headingIds ? ` id="md-h-${index}"` : '';
      out.push(`<h${level}${id}>${inlineFormat(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(paragraph);
      out.push('<hr>');
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraph);
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      out.push(
        `<blockquote>${renderMarkdown(quote.join('\n'), {
          ...opts,
          taskLine: false,
          headingIds: false,
        })}</blockquote>`
      );
      continue;
    }

    // Таблица
    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      isSeparatorRow(lines[index + 1])
    ) {
      flushParagraph(paragraph);
      const headers = parseTableRow(line);
      const separators = parseTableRow(lines[index + 1]);
      const align = separators.map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
      });
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      const th = headers
        .map(
          (cell, column) =>
            `<th${align[column] ? ` style="text-align:${align[column]}"` : ''}>${inlineFormat(cell)}</th>`
        )
        .join('');
      const body = rows
        .map(
          (cells) =>
            `<tr>${headers
              .map(
                (_header, column) =>
                  `<td${align[column] ? ` style="text-align:${align[column]}"` : ''}>${inlineFormat(
                    cells[column] || ''
                  )}</td>`
              )
              .join('')}</tr>`
        )
        .join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    // Списки, чек-листы и вложенные уровни
    if (parseListLine(line)) {
      flushParagraph(paragraph);
      const items = [];
      while (index < lines.length) {
        const parsed = parseListLine(lines[index]);
        if (!parsed) {
          // Одна пустая строка внутри списка не разрывает его (loose list),
          // но две пустые строки или обычный текст — разрывают.
          if (lines[index].trim() === '') {
            const next = index + 1;
            if (next < lines.length && lines[next].trim() && parseListLine(lines[next])) {
              index = next;
              continue;
            }
          }
          break;
        }
        items.push({
          indent: indentWidth(parsed.rawIndent),
          ordered: parsed.ordered,
          number: parsed.number,
          task: parsed.task,
          checked: parsed.checked,
          content: parsed.content,
          line: index,
        });
        index += 1;
      }
      const tree = buildListTree(items);
      out.push(tree.map((list) => renderListTree(list, opts)).join(''));
      continue;
    }

    // Встроенный виджет
    const widget = line.match(
      /^\s*::widget\[([a-zA-Z0-9_-]+)\](?:\{([^\n]*)\})?\s*$/
    );
    if (widget && opts.widgets) {
      flushParagraph(paragraph);
      out.push(
        `<div class="inline-widget" data-widget-id="${escapeAttr(widget[1])}" data-widget-config="${escapeAttr(
          widget[2] || ''
        )}"></div>`
      );
      index += 1;
      continue;
    }

    if (isBlockStart(line) && paragraph.length) {
      flushParagraph(paragraph);
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(paragraph);
  return out.join('\n');
}

/** Простой текст для превью списка заметок. */
export function stripMarkdown(source) {
  return String(source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_~`=]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractOutline(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let inFence = false;
  let fence = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fence = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fence) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      result.push({
        level: heading[1].length,
        text: stripMarkdown(heading[2]),
        line: index,
      });
    }
  }
  return result;
}

export function extractTags(source) {
  const tags = new Set();
  const text = String(source ?? '');
  const regex = /(^|[\s([>])#([\p{L}\p{N}_-]{1,40})/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tag = match[2];
    if (/^\d+$/.test(tag)) continue;
    tags.add(tag);
    if (tags.size >= 100) break;
  }
  return Array.from(tags);
}

export function countTasks(source) {
  const text = String(source ?? '');
  const total = (text.match(/^\s*(?:[-*+]|\d+\.)\s+\[[ xX]\]/gm) || []).length;
  const done = (text.match(/^\s*(?:[-*+]|\d+\.)\s+\[[xX]\]/gm) || []).length;
  return { total, done };
}
