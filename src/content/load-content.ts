import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CvContent } from './content.types.js';
import { parseHeader } from './parse-header.js';
import { titleFromFilename } from './title-from-filename.js';

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
