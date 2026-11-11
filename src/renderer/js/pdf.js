import { escapeHtml } from './dom.js';
import { renderMarkdown } from './markdown.js';

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1f2933; }
  body {
    font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
    font-size: 11.5pt;
    line-height: 1.65;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc { max-width: 100%; }
  .doc-meta {
    display: flex; justify-content: space-between; gap: 16px;
    padding-bottom: 10px; margin-bottom: 22px;
    border-bottom: 1px solid #d8dee6;
    color: #7b8794; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 8.5pt; letter-spacing: .3px;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #102a43; line-height: 1.28; page-break-after: avoid;
  }
  h1 { font-size: 24pt; margin: 0 0 14px; }
  h2 { font-size: 17pt; margin: 24px 0 9px; padding-bottom: 4px; border-bottom: 1px solid #e4e9f0; }
  h3 { font-size: 13.5pt; margin: 19px 0 7px; }
  h4 { font-size: 12pt; margin: 16px 0 6px; }
  h5, h6 { font-size: 11pt; margin: 14px 0 5px; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 10px; padding-left: 22px; }
  li { margin-bottom: 3px; }
  li.task-item { list-style: none; margin-left: -18px; }
  li.task-item input { margin-right: 6px; }
  blockquote {
    margin: 10px 0 12px; padding: 6px 13px;
    border-left: 3px solid #6b7cff; background: #f5f7ff; color: #52606d;
  }
  code {
    font-family: "SF Mono", Consolas, "Liberation Mono", monospace;
    font-size: .88em; background: #f1f4f8; color: #b42318;
    padding: 1px 4px; border-radius: 3px;
  }
  pre {
    background: #f6f8fa; border: 1px solid #e1e7ee; border-radius: 6px;
    padding: 10px 12px; overflow-x: auto; page-break-inside: avoid;
    font-size: 9pt; line-height: 1.5;
  }
  pre code { background: none; padding: 0; color: #1f2933; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 10pt; }
  th, td { border: 1px solid #d8dee6; padding: 6px 8px; text-align: left; }
  th { background: #f1f4f8; color: #102a43; }
  tr { page-break-inside: avoid; }
  hr { border: none; border-top: 1px solid #d8dee6; margin: 18px 0; }
  img { max-width: 100%; border-radius: 4px; }
  a { color: #3557d6; text-decoration: none; }
  mark { background: #fff1b8; }
  .inline-widget { display: none; }
  h1, h2, h3 { break-after: avoid; }
`;

export function buildPdfHtml(note) {
  const title = note?.title || 'Заметка';
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const body = renderMarkdown(note?.body || '', { widgets: false, taskLine: false });
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline';">
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <article class="doc">
    <div class="doc-meta"><span>NMB Notes</span><span>${escapeHtml(date)}</span></div>
    ${body}
  </article>
</body>
</html>`;
}
