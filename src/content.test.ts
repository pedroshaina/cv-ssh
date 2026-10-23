import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { loadContent, renderBanner, renderMarkdown } from './content.js';

function contentDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cv-ssh-content-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('every Markdown file is a tab, ordered by filename, titled from it', () => {
  const dir = contentDir({
    '02-side-projects.md': '# Projects',
    '01-about.md': '# About',
    'notes.txt': 'ignored',
  });
  const { sections } = loadContent(dir);
  assert.deepEqual(
    sections.map((s) => s.title),
    ['About', 'Side projects'],
  );
});

test('_header.md is the banner, not a tab', () => {
  const dir = contentDir({
    '_header.md': '# Ada Lovelace\n\n**Analyst** · London\n',
    '01-about.md': '# About',
  });
  const { header, sections } = loadContent(dir);
  assert.deepEqual(header, { name: 'Ada Lovelace', tagline: '**Analyst** · London' });
  assert.deepEqual(
    sections.map((s) => s.title),
    ['About'],
  );
});

test('no _header.md means no banner', () => {
  assert.equal(loadContent(contentDir({ '01-about.md': '# About' })).header, undefined);
});

test('bold text inside list items is rendered, not printed literally', () => {
  const out = stripVTControlCharacters(renderMarkdown('- **Email:** someone', 80));
  assert.match(out, /Email: someone/);
  assert.doesNotMatch(out, /\*\*/);
});

test('a bare email address is printed once, without its mailto: link', () => {
  const out = stripVTControlCharacters(renderMarkdown('- you@example.com', 80));
  assert.match(out, /you@example\.com/);
  assert.doesNotMatch(out, /mailto:/);
});

test('the banner uses the biggest font that fits, or none', () => {
  const wide = renderBanner('Ada', 200);
  const narrow = renderBanner('Ada', 5);
  assert.ok(wide && wide.split('\n').every((line) => line.length <= 200));
  assert.equal(narrow, undefined);
});
