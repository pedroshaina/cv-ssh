import { Marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { markedTerminalFixes } from './marked-terminal-fixes.js';

export function renderMarkdown(markdown: string, width: number): string {
  // @types/marked-terminal still describes v6; v7 returns a marked extension.
  const terminalRenderer = markedTerminal({
    width,
    reflowText: true,
    tab: 2,
    showSectionPrefix: false,
  }) as unknown as MarkedExtension;
  const marked = new Marked(terminalRenderer, markedTerminalFixes(width));
  return (marked.parse(markdown) as string).trimEnd();
}
