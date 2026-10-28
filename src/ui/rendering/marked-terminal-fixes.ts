import type { MarkedExtension } from 'marked';
import wrapAnsi from 'wrap-ansi';
import { MIN_TEXT_WIDTH } from '../layout.constants.js';

/** The list's tab (2) plus "* ". */
const LIST_TEXT_INDENT = 4;

// Workarounds for marked-terminal quirks; returning false uses its own renderer.
export function markedTerminalFixes(width: number): MarkedExtension {
  return {
    renderer: {
      // Tight list items come out verbatim: literal `**` and no reflow.
      text(token) {
        if (!('tokens' in token && token.tokens)) return false;
        const inlineText = this.parser.parseInline(token.tokens).replace(/\s*\n\s*/g, ' ');
        return wrapAnsi(inlineText, Math.max(MIN_TEXT_WIDTH, width - LIST_TEXT_INDENT));
      },
      // Otherwise a bare email prints as "you@x.com (mailto:you@x.com)".
      link(token) {
        if (token.href === `mailto:${token.text}`) token.href = token.text;
        return false;
      },
    },
  };
}
