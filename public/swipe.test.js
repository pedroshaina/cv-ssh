import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swipeDelta } from './swipe.js';

test('a horizontal swipe left goes to the next section, right to the previous', () => {
  assert.equal(swipeDelta(-80, 10), 1);
  assert.equal(swipeDelta(80, 0), -1);
});

test('short drags are not swipes', () => {
  assert.equal(swipeDelta(-59, 0), 0);
});

test('a diagonal or vertical drag is a scroll, not a swipe', () => {
  assert.equal(swipeDelta(-80, 70), 0);
  assert.equal(swipeDelta(0, -300), 0);
});
