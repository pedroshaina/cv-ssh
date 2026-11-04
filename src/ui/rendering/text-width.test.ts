import assert from 'node:assert/strict';
import { test } from 'node:test';
import { textWidthFor } from './text-width.js';

test('text width leaves the side padding and stays between 20 and 80 columns', () => {
  assert.equal(textWidthFor(30), 26);
  assert.equal(textWidthFor(10), 20);
  assert.equal(textWidthFor(200), 80);
});
