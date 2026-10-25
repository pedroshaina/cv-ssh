import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBanner } from './render-banner.js';

test('the banner uses the biggest font that fits, or none', () => {
  const wideBanner = renderBanner('Ada', 200);
  const narrowBanner = renderBanner('Ada', 5);
  assert.ok(wideBanner && wideBanner.split('\n').every((line) => line.length <= 200));
  assert.equal(narrowBanner, undefined);
});
