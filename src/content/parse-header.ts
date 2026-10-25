import type { Header } from './content.types.js';

/** `# Name` on the first heading line; everything after it is the tagline. */
export function parseHeader(markdown: string): Header | undefined {
  const headingMatch = /^#\s+(.+)$/m.exec(markdown);
  if (!headingMatch?.[1]) return undefined;
  return {
    name: headingMatch[1].trim(),
    tagline: markdown.slice(headingMatch.index + headingMatch[0].length).trim(),
  };
}
