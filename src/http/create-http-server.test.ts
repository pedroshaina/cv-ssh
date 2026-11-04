import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { loadContent } from '../content/load-content.js';
import { createLogger } from '../logging/create-logger.js';
import { renderCvView } from '../web/render-cv-view.js';
import { createHttpServer } from './create-http-server.js';

const contentDir = mkdtempSync(join(tmpdir(), 'cv-ssh-http-'));
writeFileSync(join(contentDir, '_header.md'), '# Ada Lovelace\n\n**Analyst** · London\n');
writeFileSync(join(contentDir, '01-about.md'), '## About\n\nFirst programmer.\n');
writeFileSync(join(contentDir, '02-contact.md'), '## Contact\n\n- ada@example.com\n');

let ready = true;
const httpServer = createHttpServer({ isReady: () => ready, contentDir, logger: createLogger('silent') });
let baseUrl: string;

before(async () => {
  const { port } = await httpServer.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${port}`;
});
after(() => httpServer.close());

test('/health is always 200', async () => {
  ready = false;
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/health?probe=1`)).status, 200);
});

test('/ready follows the readiness callback', async () => {
  ready = true;
  assert.equal((await fetch(`${baseUrl}/ready`)).status, 200);
  ready = false;
  assert.equal((await fetch(`${baseUrl}/ready`)).status, 503);
});

test('/cv.json is the CV rendered for the requested width', async () => {
  const response = await fetch(`${baseUrl}/cv.json?cols=50`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(await response.json(), renderCvView(loadContent(contentDir), 50));
});

test('/cv.json defaults to 80 columns and clamps small widths', async () => {
  assert.equal(((await (await fetch(`${baseUrl}/cv.json`)).json()) as { cols: number }).cols, 80);
  assert.equal(((await (await fetch(`${baseUrl}/cv.json?cols=1`)).json()) as { cols: number }).cols, 24);
});

test('/cv.json rejects a cols that is not a number', async () => {
  assert.equal((await fetch(`${baseUrl}/cv.json?cols=abc`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/cv.json?cols=1e9`)).status, 400);
});

test('HEAD gets the headers without a body', async () => {
  const response = await fetch(`${baseUrl}/cv.json`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('other methods are 405 and unknown paths 404', async () => {
  assert.equal((await fetch(`${baseUrl}/cv.json`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${baseUrl}/nope`)).status, 404);
});

const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

test('/ is the CV page, with every section and strict headers', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'), PAGE_CSP);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const page = await response.text();
  for (const title of ['About', 'Contact']) assert.ok(page.includes(`>${title}<`), title);
});

test('/assets serves files from public/ and 404s the rest', async () => {
  const stylesheet = await fetch(`${baseUrl}/assets/style.css`);
  assert.equal(stylesheet.status, 200);
  assert.equal(stylesheet.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await fetch(`${baseUrl}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/assets/%2e%2e/package.json`)).status, 404);
});

test('unreadable content is a 500, and the probes keep answering', async () => {
  const brokenDir = mkdtempSync(join(tmpdir(), 'cv-ssh-broken-'));
  chmodSync(brokenDir, 0o000);
  const brokenServer = createHttpServer({ isReady: () => true, contentDir: brokenDir, logger: createLogger('silent') });
  const { port } = await brokenServer.listen(0, '127.0.0.1');
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 500);
    assert.equal((await fetch(`http://127.0.0.1:${port}/cv.json`)).status, 500);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    chmodSync(brokenDir, 0o700);
    await brokenServer.close();
  }
});
