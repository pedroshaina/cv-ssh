import type { MarkedExtension } from 'marked';
import wrapAnsi from 'wrap-ansi';
import { MIN_TEXT_WIDTH } from '../layout.constants.js';

/** Columns a top-level list item's text starts at: the list's tab (2) plus "* ". */
const LIST_TEXT_INDENT = 4;

// Workarounds for marked-terminal quirks. Returning false falls back to
// marked-terminal's own renderer.
export function markedTerminalFixes(width: number): MarkedExtension {
  return {
    renderer: {
      // Tight list items are rendered verbatim: `- **Email:** x` would show
      // literal asterisks, and the source's line breaks would be kept instead
      // of reflowing like paragraphs do. Render their inline tokens, turn soft
      // breaks into spaces and wrap to the width left after the bullet;
      // marked-terminal then indents the continuation lines.
      text(token) {
        if (!('tokens' in token && token.tokens)) return false;
        const inlineText = this.parser.parseInline(token.tokens).replace(/\s*\n\s*/g, ' ');
        return wrapAnsi(inlineText, Math.max(MIN_TEXT_WIDTH, width - LIST_TEXT_INDENT));
      },
      // A bare email address renders as "you@x.com (mailto:you@x.com)". Making
      // href match the text lets marked-terminal print it once.
      link(token) {
        if (token.href === `mailto:${token.text}`) token.href = token.text;
        return false;
      },
    },
  };
}
