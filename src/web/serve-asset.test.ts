import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolveAsset } from './serve-asset.js';

test('scripts and stylesheets in public/ resolve with their content type', () => {
  const script = resolveAsset('/assets/app.js');
  assert.equal(script?.contentType, 'text/javascript; charset=utf-8');
  assert.match(script?.filePath ?? '', /[/\\]public[/\\]app\.js$/);
  const stylesheet = resolveAsset('/assets/style.css');
  assert.equal(stylesheet?.contentType, 'text/css; charset=utf-8');
  assert.ok(existsSync(stylesheet?.filePath ?? ''));
});

test('anything that is not a plain file name in public/ does not resolve', () => {
  for (const pathname of [
    '/assets/../package.json',
    '/assets/%2e%2e/package.json',
    '/assets/..%2fpackage.json',
    '/assets/sub/x.js',
    '/assets/x.ts',
    '/assets/X.js',
    '/assets/',
    '/public/style.css',
  ]) {
    assert.equal(resolveAsset(pathname), undefined, pathname);
  }
});
