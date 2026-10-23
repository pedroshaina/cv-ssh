import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import figlet from 'figlet';
import { Marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import wrapAnsi from 'wrap-ansi';

export interface Section {
  title: string;
  markdown: string;
}

export interface Header {
  name: string;
  /** Markdown shown under the name. */
  tagline: string;
}

export interface CvContent {
  header?: Header;
  sections: Section[];
}

/**
 * Every `*.md` file in `dir` becomes a tab, ordered by filename:
 * `01-about.md` -> "About", `03-side-projects.md` -> "Side projects".
 * Files starting with `_` are not tabs; `_header.md` holds the banner.
 */
export function loadContent(dir: string): CvContent {
  const sections = readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
    .sort()
    .map((file) => ({
      title: titleFromFilename(file),
      markdown: readFileSync(join(dir, file), 'utf8'),
    }));

  const headerPath = join(dir, '_header.md');
  const header = existsSync(headerPath) ? parseHeader(readFileSync(headerPath, 'utf8')) : undefined;
  return { header, sections };
}

function titleFromFilename(file: string): string {
  const words = file
    .replace(/\.md$/, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `# Name` on the first heading line; everything after it is the tagline. */
function parseHeader(markdown: string): Header | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  if (!match?.[1]) return undefined;
  return {
    name: match[1].trim(),
    tagline: markdown.slice(match.index + match[0].length).trim(),
  };
}

// Biggest first; the banner uses the first font that fits the terminal.
const BANNER_FONTS = ['ANSI Shadow', 'Standard', 'Small'] as const;

/** The name as ASCII art no wider than `maxWidth`, or undefined if no font fits. */
export function renderBanner(name: string, maxWidth: number): string | undefined {
  for (const font of BANNER_FONTS) {
    const art = figlet.textSync(name, { font }).replace(/\s+$/, '');
    const width = Math.max(...art.split('\n').map((line) => line.length));
    if (width <= maxWidth) return art;
  }
  return undefined;
}

/** Columns a top-level list item's text starts at: the list's tab (2) plus "* ". */
const LIST_TEXT_INDENT = 4;

// Workarounds for marked-terminal quirks. Returning false falls back to
// marked-terminal's own renderer.
function fixes(width: number): MarkedExtension {
  return {
    renderer: {
      // Tight list items are rendered verbatim: `- **Email:** x` would show
      // literal asterisks, and the source's line breaks would be kept instead
      // of reflowing like paragraphs do. Render their inline tokens, turn soft
      // breaks into spaces and wrap to the width left after the bullet;
      // marked-terminal then indents the continuation lines.
      text(token) {
        if (!('tokens' in token && token.tokens)) return false;
        const inline = this.parser.parseInline(token.tokens).replace(/\s*\n\s*/g, ' ');
        return wrapAnsi(inline, Math.max(20, width - LIST_TEXT_INDENT));
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

export function renderMarkdown(markdown: string, width: number): string {
  // @types/marked-terminal still describes v6; v7 returns a marked extension.
  const terminal = markedTerminal({ width, reflowText: true, tab: 2, showSectionPrefix: false }) as unknown as MarkedExtension;
  const marked = new Marked(terminal, fixes(width));
  return (marked.parse(markdown) as string).trimEnd();
}
