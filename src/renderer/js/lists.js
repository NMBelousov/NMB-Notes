/**
 * Работа с Markdown-списками в plain-text редакторе.
 *
 * Модуль намеренно не зависит от DOM: его можно проверять отдельно и
 * переиспользовать в предпросмотре. Поддерживаются вложенные списки
 * (отступ в 2 пробела), нумерованные списки и чек-листы.
 */

export const LIST_LINE_RE = /^([ \t]*)([-*+]|\d+\.)[ \t]+(.*)$/;
const TASK_RE = /^\[([ xX])\][ \t]+(.*)$/;
const FENCE_RE = /^\s*(```+|~~~+)/;

/** Визуальная ширина отступа: табуляция считается за два пробела. */
export function indentWidth(rawIndent) {
  let width = 0;
  for (const char of String(rawIndent || '')) {
    width += char === '\t' ? 2 : 1;
  }
  return width;
}

/** Разбирает строку списка. Возвращает null для обычного текста. */
export function parseListLine(line) {
  const match = String(line ?? '').match(LIST_LINE_RE);
  if (!match) return null;
  const [, rawIndent, marker, after] = match;
  const ordered = /^\d+\.$/.test(marker);
  const taskMatch = after.match(TASK_RE);
  return {
    rawIndent,
    indent: indentWidth(rawIndent),
    marker,
    ordered,
    number: ordered ? Number.parseInt(marker, 10) : null,
    task: Boolean(taskMatch),
    checked: taskMatch ? taskMatch[1].toLowerCase() === 'x' : false,
    content: taskMatch ? taskMatch[2] : after,
  };
}

function mapPosition(position, changes) {
  let delta = 0;
  for (const change of changes) {
    if (position >= change.start + change.oldLen) {
      delta += change.newLen - change.oldLen;
    } else if (position >= change.start) {
      return change.start + delta + Math.min(position - change.start, change.newLen);
    } else {
      break;
    }
  }
  return position + delta;
}

/**
 * Перенумеровывает упорядоченные списки: 1, 2, 3… с учётом вложенности.
 * Первое число списка сохраняется (например, список может начинаться с 3).
 * Позиции каретки/выделения корректно сдвигаются после замены цифр.
 */
export function renumberOrderedLists(
  text,
  selectionStart = 0,
  selectionEnd = selectionStart,
  options = {}
) {
  const source = String(text ?? '');
  const lines = source.split('\n');
  const changes = [];
  const stack = [];
  let inFence = false;
  let fenceChar = '';
  let blankLines = 0;
  let offset = 0;

  for (const line of lines) {
    const fence = line.match(FENCE_RE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
        stack.length = 0;
      } else if (fence[1][0] === fenceChar) {
        inFence = false;
        stack.length = 0;
      }
      offset += line.length + 1;
      continue;
    }
    if (inFence) {
      offset += line.length + 1;
      continue;
    }

    const info = parseListLine(line);
    if (!info) {
      if (line.trim()) {
        stack.length = 0;
        blankLines = 0;
      } else {
        blankLines += 1;
      }
      offset += line.length + 1;
      continue;
    }

    // Две пустые строки подряд начинают новый список — так же, как в
    // предпросмотре Markdown.
    if (blankLines >= 2) stack.length = 0;
    blankLines = 0;

    while (stack.length && info.indent < stack[stack.length - 1].indent) {
      stack.pop();
    }

    let context = stack[stack.length - 1];
    if (context && info.indent === context.indent) {
      if (context.ordered !== info.ordered) {
        // Смена типа списка на том же уровне начинает новый список.
        stack.pop();
        context = {
          indent: info.indent,
          ordered: info.ordered,
          lastNumber: info.number || 1,
        };
        stack.push(context);
      } else if (info.ordered) {
        const nextNumber = (context.lastNumber || 0) + 1;
        const nextMarker = `${nextNumber}.`;
        if (info.marker !== nextMarker) {
          changes.push({
            start: offset + info.rawIndent.length,
            oldLen: info.marker.length,
            newLen: nextMarker.length,
            newMarker: nextMarker,
          });
        }
        context.lastNumber = nextNumber;
      }
    } else {
      // Более глубокий уровень или начало нового блока. При вложении
      // существующего пункта новый подсписок начинается с 1.
      const nested = Boolean(context);
      const resetNested = nested && options.resetNested === true;
      context = {
        indent: info.indent,
        ordered: info.ordered,
        lastNumber: resetNested ? 0 : info.number || 1,
      };
      stack.push(context);
      if (resetNested && info.ordered) {
        const nextMarker = '1.';
        if (info.marker !== nextMarker) {
          changes.push({
            start: offset + info.rawIndent.length,
            oldLen: info.marker.length,
            newLen: nextMarker.length,
            newMarker: nextMarker,
          });
        }
        context.lastNumber = 1;
      }
    }

    offset += line.length + 1;
  }

  if (!changes.length) {
    return { text: source, selectionStart, selectionEnd };
  }

  let result = source;
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    result =
      result.slice(0, change.start) +
      change.newMarker +
      result.slice(change.start + change.oldLen);
  }

  return {
    text: result,
    selectionStart: mapPosition(selectionStart, changes),
    selectionEnd: mapPosition(selectionEnd, changes),
  };
}

/**
 * Меняет отступ выбранных строк на один уровень (2 пробела).
 * delta > 0 — вложить, delta < 0 — вынуть. Пустые строки не трогаем.
 */
export function indentListSelection(text, selectionStart, selectionEnd, delta) {
  const value = String(text ?? '');
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const lineDeltas = lines.map((line) => {
    if (!line.trim()) return 0;
    const info = parseListLine(line);
    if (delta > 0) {
      // Списки живут уровнями по 2 пробела: выравниваем нечётные отступы.
      if (info) {
        const target = Math.floor(info.indent / 2) * 2 + 2;
        return target - info.indent;
      }
      return 2;
    }
    if (info) {
      const target = Math.max(0, Math.floor(info.indent / 2) * 2 - 2);
      return target - info.indent;
    }
    const match = line.match(/^(\t| {1,2})/);
    return match ? -match[0].length : 0;
  });

  const nextLines = lines.map((line, index) => {
    const change = lineDeltas[index];
    if (!change) return line;
    if (change > 0) return `${'  '.slice(0, change)}${line}`;
    return line.slice(-change);
  });

  const totalChange = lineDeltas.reduce((sum, change) => sum + change, 0);
  if (!totalChange) return { text: value, selectionStart, selectionEnd };

  const prefix = [];
  let running = 0;
  for (const change of lineDeltas) {
    prefix.push(running);
    running += change;
  }

  const nextBlock = nextLines.join('\n');
  const nextText = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);

  const mapBoundary = (position) => {
    if (position <= lineStart) return position;
    if (position >= lineEnd) return position + totalChange;
    const relative = position - lineStart;
    const before = block.slice(0, relative);
    const lineIndex = before.split('\n').length - 1;
    const column = relative - (before.lastIndexOf('\n') + 1);
    const nextColumn = Math.max(0, column + lineDeltas[lineIndex]);
    return lineStart + prefix[lineIndex] + nextColumn;
  };

  return {
    text: nextText,
    selectionStart: mapBoundary(start),
    selectionEnd: mapBoundary(end),
    lineStart,
  };
}

/** Возвращает префикс следующего пункта списка для Enter. */
export function nextListPrefix(info) {
  if (!info) return '';
  const marker = info.ordered ? `${info.number + 1}.` : info.marker;
  return `${info.rawIndent}${marker} ${info.task ? '[ ] ' : ''}`;
}

/** Отступ для вложенного пункта: два пробела на уровень. */
export function nestLevelFor(indent) {
  return Math.max(0, Math.floor(indent / 2));
}
