import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ansiToHtml } from './ansi-to-html.js';

test('plain text passes through', () => {
  assert.equal(ansiToHtml('plain'), 'plain');
});

test('bold becomes a classed span that ends where bold ends', () => {
  assert.equal(ansiToHtml('\x1b[1mbold\x1b[22m after'), '<span class="b">bold</span> after');
});

test('attributes combine and are cleared one by one', () => {
  assert.equal(
    ansiToHtml('\x1b[1m\x1b[32mgreen bold\x1b[39m bold\x1b[0m'),
    '<span class="b fg-2">green bold</span><span class="b"> bold</span>',
  );
});

test('bright and background colours map to the 16-colour classes', () => {
  assert.equal(ansiToHtml('\x1b[94mx\x1b[0m'), '<span class="fg-12">x</span>');
  assert.equal(ansiToHtml('\x1b[41mx\x1b[49m'), '<span class="bg-1">x</span>');
  assert.equal(ansiToHtml('\x1b[101mx\x1b[0m'), '<span class="bg-9">x</span>');
});

test('italic, underline, inverse and dim each have a class and a reset', () => {
  assert.equal(
    ansiToHtml('\x1b[3mi\x1b[23m\x1b[4mu\x1b[24m\x1b[7mv\x1b[27m\x1b[2md\x1b[22m'),
    '<span class="i">i</span><span class="u">u</span><span class="inv">v</span><span class="dim">d</span>',
  );
});

test('unknown SGR codes and other escape sequences are dropped', () => {
  assert.equal(ansiToHtml('\x1b[38;5;200mx\x1b[0m\x1b[2K'), 'x');
  assert.equal(ansiToHtml('\x1b[1;38;2;1;2;3mx\x1b[0m'), '<span class="b">x</span>');
});

test('text is escaped, inside spans too', () => {
  assert.equal(ansiToHtml('\x1b[1m<b>&\x1b[0m'), '<span class="b">&lt;b&gt;&amp;</span>');
  assert.equal(ansiToHtml('<script>'), '&lt;script&gt;');
});

test('newlines are kept and a span left open at the end is closed', () => {
  assert.equal(ansiToHtml('a\n\x1b[1mb\nc'), 'a\n<span class="b">b\nc</span>');
});

test('styles with no text produce no empty spans', () => {
  assert.equal(ansiToHtml('\x1b[1m\x1b[22mx'), 'x');
});
