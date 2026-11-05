import { escapeHtml } from './escape-html.js';

interface TextStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  foreground?: number;
  background?: number;
}

const PLAIN: TextStyle = { bold: false, dim: false, italic: false, underline: false, inverse: false };

// Any CSI sequence; only SGR (final byte "m") is interpreted, the rest is dropped.
// oxlint-disable-next-line no-control-regex -- matching ESC is the point
const CSI_SEQUENCE = /\x1b\[([0-9;]*)([A-Za-z])/g;

/** Terminal SGR codes to `<span class>` markup (classes, not inline styles, so the CSP stays strict). */
export function ansiToHtml(ansi: string): string {
  let html = '';
  let style: TextStyle = { ...PLAIN };
  let textStart = 0;

  for (const match of ansi.matchAll(CSI_SEQUENCE)) {
    html += styledRun(ansi.slice(textStart, match.index), style);
    textStart = match.index + match[0].length;
    if (match[2] === 'm') style = applySgr(style, match[1] ?? '');
  }
  return html + styledRun(ansi.slice(textStart), style);
}

function applySgr(current: TextStyle, parameters: string): TextStyle {
  const codes = parameters === '' ? [0] : parameters.split(';').map(Number);
  const next = { ...current };
  for (let position = 0; position < codes.length; position++) {
    const code = codes[position] ?? 0;
    if (code === 0) Object.assign(next, PLAIN, { foreground: undefined, background: undefined });
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 22) next.bold = next.dim = false;
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code >= 30 && code <= 37) next.foreground = code - 30;
    else if (code >= 90 && code <= 97) next.foreground = code - 90 + 8;
    else if (code === 39) next.foreground = undefined;
    else if (code >= 40 && code <= 47) next.background = code - 40;
    else if (code >= 100 && code <= 107) next.background = code - 100 + 8;
    else if (code === 49) next.background = undefined;
    // 256-colour and truecolour: skip their arguments, keep the current colour.
    else if (code === 38 || code === 48) position += codes[position + 1] === 5 ? 2 : codes[position + 1] === 2 ? 4 : 0;
  }
  return next;
}

function styledRun(text: string, style: TextStyle): string {
  if (text === '') return '';
  const classes = [
    style.bold && 'b',
    style.dim && 'dim',
    style.italic && 'i',
    style.underline && 'u',
    style.inverse && 'inv',
    style.foreground !== undefined && `fg-${style.foreground}`,
    style.background !== undefined && `bg-${style.background}`,
  ].filter(Boolean);
  const escaped = escapeHtml(text);
  return classes.length === 0 ? escaped : `<span class="${classes.join(' ')}">${escaped}</span>`;
}
