import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHttpServer } from './create-http-server.js';

let ready = true;
const httpServer = createHttpServer(() => ready);
let baseUrl: string;

before(async () => {
  const { port } = await httpServer.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${port}`;
});
after(() => httpServer.close());

test('listening on a port already in use rejects', async () => {
  const otherServer = createHttpServer(() => ready);
  await assert.rejects(otherServer.listen(Number(new URL(baseUrl).port), '127.0.0.1'), { code: 'EADDRINUSE' });
});

test('/health is always 200', async () => {
  ready = false;
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
});

test('/ready follows the readiness callback', async () => {
  ready = true;
  assert.equal((await fetch(`${baseUrl}/ready`)).status, 200);
  ready = false;
  assert.equal((await fetch(`${baseUrl}/ready`)).status, 503);
});

test('anything else is 404', async () => {
  assert.equal((await fetch(`${baseUrl}/`)).status, 404);
});
