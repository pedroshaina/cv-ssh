import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadContent } from './load-content.js';

function createContentDir(files: Record<string, string>): string {
  const contentDir = mkdtempSync(join(tmpdir(), 'cv-ssh-content-'));
  for (const [filename, fileBody] of Object.entries(files)) writeFileSync(join(contentDir, filename), fileBody);
  return contentDir;
}

test('every Markdown file is a tab, ordered by filename, titled from it', () => {
  const contentDir = createContentDir({
    '02-side-projects.md': '# Projects',
    '01-about.md': '# About',
    'notes.txt': 'ignored',
  });
  const { sections } = loadContent(contentDir);
  assert.deepEqual(
    sections.map((section) => section.title),
    ['About', 'Side projects'],
  );
});

test('_header.md is the banner, not a tab', () => {
  const contentDir = createContentDir({
    '_header.md': '# Ada Lovelace\n\n**Analyst** · London\n',
    '01-about.md': '# About',
  });
  const { header, sections } = loadContent(contentDir);
  assert.deepEqual(header, { name: 'Ada Lovelace', tagline: '**Analyst** · London' });
  assert.deepEqual(
    sections.map((section) => section.title),
    ['About'],
  );
});

test('no _header.md means no banner', () => {
  assert.equal(loadContent(createContentDir({ '01-about.md': '# About' })).header, undefined);
});
