import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColumns } from './parse-columns.js';

test('no cols means the default 80', () => {
  assert.equal(parseColumns(null), 80);
});

test('cols in range are kept, out of range are clamped to 24..240', () => {
  assert.equal(parseColumns('42'), 42);
  assert.equal(parseColumns('5'), 24);
  assert.equal(parseColumns('9999'), 240);
});

test('anything but a short base-10 integer is rejected', () => {
  for (const raw of ['abc', '-5', '1.5', '1e9', '', ' 42', '99999', '0x20']) {
    assert.equal(parseColumns(raw), undefined, raw);
  }
});
