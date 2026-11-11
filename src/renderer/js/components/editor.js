import { state, on, activeNote, touchNote, flushNotes, markSaved } from '../state.js';
import { createSlashMenu } from './slashMenu.js';
import { toast, notifyError } from '../toast.js';

export function mountEditor(textarea) {
  let currentId = null;
  const slash = createSlashMenu({
    textarea,
    enabled: () => state.settings?.editor?.slashMenu !== false,
  });

  const setNote = (note) => {
    if (!note) {
      currentId = null;
      textarea.value = '';
      textarea.disabled = true;
      textarea.placeholder = 'Выберите заметку или создайте новую';
      return;
    }
    if (currentId === note.id) return;
    currentId = note.id;
    textarea.disabled = false;
    textarea.value = note.body || '';
    textarea.selectionStart = textarea.selectionEnd = 0;
    textarea.placeholder = 'Начните писать… Нажмите / в начале строки';
    textarea.scrollTop = 0;
  };

  const dispatchInput = () => {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const insertAtCursor = (text, mode = 'cursor') => {
    if (textarea.disabled) return;
    const value = textarea.value;
    if (mode === 'end') {
      const prefix = value && !value.endsWith('\n') ? '\n\n' : '';
      textarea.value = value + prefix + text;
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    } else {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = value.slice(0, start) + text + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }
    textarea.focus();
    dispatchInput();
  };

  const replaceSelection = (text) => {
    if (textarea.disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
    dispatchInput();
  };

  const smartListEnter = () => {
    if (state.settings?.editor?.smartLists === false) return false;
    const start = textarea.selectionStart;
    if (start !== textarea.selectionEnd) return false;
    const before = textarea.value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.*)$/);
    if (!match) return false;
    const [, indent, marker, task, rest] = match;
    const nextMarker = /^\d+\.$/.test(marker)
      ? `${parseInt(marker, 10) + 1}.`
      : marker;
    if (!rest.trim()) {
      const value = textarea.value;
      textarea.value = value.slice(0, lineStart) + value.slice(start);
      textarea.selectionStart = textarea.selectionEnd = lineStart;
      dispatchInput();
      return true;
    }
    const insert = `\n${indent}${nextMarker} ${task ? '[ ] ' : ''}`;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + insert + value.slice(start);
    textarea.selectionStart = textarea.selectionEnd = start + insert.length;
    dispatchInput();
    return true;
  };

  textarea.addEventListener('input', () => {
    if (!activeNote()) return;
    touchNote({ body: textarea.value });
    slash.handleInput();
  });

  textarea.addEventListener('keydown', (event) => {
    if (slash.handleKeydown(event)) return;

    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      flushNotes()
        .then(() => {
          markSaved();
          toast('Сохранено');
        })
        .catch(notifyError);
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !mod && smartListEnter()) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      if (start === end) {
        if (event.shiftKey) {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const remove = value.slice(lineStart, start).match(/ {1,2}$/)?.[0].length || 0;
          if (remove) {
            textarea.value = value.slice(0, start - remove) + value.slice(start);
            textarea.selectionStart = textarea.selectionEnd = start - remove;
            dispatchInput();
          }
        } else {
          const insert = '  ';
          textarea.value = value.slice(0, start) + insert + value.slice(end);
          textarea.selectionStart = textarea.selectionEnd = start + insert.length;
          dispatchInput();
        }
        return;
      }
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const block = value.slice(lineStart, end);
      const indented = block
        .split('\n')
        .map((line) => (event.shiftKey ? line.replace(/^ {1,2}/, '') : `  ${line}`))
        .join('\n');
      textarea.value = value.slice(0, lineStart) + indented + value.slice(end);
      textarea.selectionStart = lineStart;
      textarea.selectionEnd = lineStart + indented.length;
      dispatchInput();
      return;
    }

    if (event.key === 'Escape') {
      slash.close();
    }
  });

  textarea.addEventListener('blur', () => {
    flushNotes().catch(() => {});
  });

  on('note:selected', setNote);
  on('editor:focus', () => {
    textarea.focus();
  });
  on('editor:insert', ({ text, mode }) => insertAtCursor(String(text || ''), mode));
  on('editor:replace-selection', ({ text }) => replaceSelection(String(text || '')));
  on('editor:replace-body', ({ body }) => {
    if (textarea.disabled) return;
    const position = textarea.selectionStart;
    textarea.value = String(body ?? '');
    textarea.selectionStart = textarea.selectionEnd = Math.min(
      position,
      textarea.value.length
    );
    textarea.focus();
    dispatchInput();
  });
  on('editor:goto-line', ({ line }) => {
    if (textarea.disabled) return;
    const lines = textarea.value.split('\n');
    const safeLine = Math.max(0, Math.min(lines.length - 1, Number(line) || 0));
    let position = 0;
    for (let index = 0; index < safeLine; index += 1) position += lines[index].length + 1;
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = position;
    const lineHeight =
      parseFloat(getComputedStyle(textarea).lineHeight) ||
      (state.settings?.appearance?.editorFontSize || 14) * 1.7;
    textarea.scrollTop = Math.max(0, safeLine * lineHeight - textarea.clientHeight / 3);
  });
  on('settings:changed', (settings) => {
    textarea.spellcheck = settings.editor.spellcheck !== false;
    slash.refresh();
  });
  on('widgets:changed', () => slash.refresh());

  textarea.spellcheck = state.settings?.editor?.spellcheck !== false;
  setNote(activeNote());
  if (activeNote()) {
    textarea.focus();
  }
}
