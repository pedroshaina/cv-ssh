import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBanner } from './render-banner.js';

function widthOf(bannerArt: string): number {
  return Math.max(...bannerArt.split('\n').map((line) => line.length));
}

test('narrower terminals get a smaller font, and no banner when none fits', () => {
  const biggest = renderBanner('Ada', 200);
  assert.ok(biggest);
  const maxWidth = widthOf(biggest) - 1;
  const smaller = renderBanner('Ada', maxWidth);
  assert.ok(smaller);
  assert.ok(widthOf(smaller) <= maxWidth);
  assert.equal(renderBanner('Ada', 5), undefined);
});
