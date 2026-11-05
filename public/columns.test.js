import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnsFor } from './columns.js';

test('columns are the whole characters that fit', () => {
  assert.equal(columnsFor(800, 9), 88);
  assert.equal(columnsFor(359.5, 9), 39);
});

test('an unmeasurable character width gives 0 columns', () => {
  assert.equal(columnsFor(100, 0), 0);
});
