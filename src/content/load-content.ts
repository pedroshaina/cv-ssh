import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CvContent, Header } from './content.types.js';

/**
 * Every `*.md` file in `contentDir` becomes a tab, ordered by filename.
 * Files starting with `_` are not tabs; `_header.md` holds the banner.
 */
export function loadContent(contentDir: string): CvContent {
  const sections = readdirSync(contentDir)
    .filter((filename) => filename.endsWith('.md') && !filename.startsWith('_'))
    .sort()
    .map((filename) => ({
      title: titleFromFilename(filename),
      markdown: readFileSync(join(contentDir, filename), 'utf8'),
    }));

  const headerPath = join(contentDir, '_header.md');
  const header = existsSync(headerPath) ? parseHeader(readFileSync(headerPath, 'utf8')) : undefined;
  return { header, sections };
}

/** `01-about.md` -> "About", `03-side-projects.md` -> "Side projects". */
function titleFromFilename(filename: string): string {
  const words = filename
    .replace(/\.md$/, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `# Name` on the first heading line; everything after it is the tagline. */
function parseHeader(markdown: string): Header | undefined {
  const headingMatch = /^#\s+(.+)$/m.exec(markdown);
  if (!headingMatch?.[1]) return undefined;
  return {
    name: headingMatch[1].trim(),
    tagline: markdown.slice(headingMatch.index + headingMatch[0].length).trim(),
  };
}
