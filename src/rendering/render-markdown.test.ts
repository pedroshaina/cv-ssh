import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { renderMarkdown } from './render-markdown.js';

test('bold text inside list items is rendered, not printed literally', () => {
  const renderedText = stripVTControlCharacters(renderMarkdown('- **Email:** someone', 80));
  assert.match(renderedText, /Email: someone/);
  assert.doesNotMatch(renderedText, /\*\*/);
});

test('list items reflow to the width like paragraphs, ignoring source line breaks', () => {
  const listItem = '- one two three four five six seven\n  eight nine ten eleven twelve thirteen fourteen';
  const lines = stripVTControlCharacters(renderMarkdown(listItem, 50)).split('\n');
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.ok(lines.every((line) => line.length <= 50), lines.join('\n'));
  // The source broke after "seven"; at width 50 the first line takes more words.
  assert.match(lines[0] ?? '', /seven eight/);
  // Continuation lines are indented under the bullet's text.
  assert.ok(lines.slice(1).every((line) => line.startsWith('    ')), lines.join('\n'));
});

test('a bare email address is printed once, without its mailto: link', () => {
  const renderedText = stripVTControlCharacters(renderMarkdown('- you@example.com', 80));
  assert.match(renderedText, /you@example\.com/);
  assert.doesNotMatch(renderedText, /mailto:/);
});
