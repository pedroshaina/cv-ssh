import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createHttpServer } from './create-http-server.js';

let ready = true;
const httpServer = createHttpServer(() => ready);
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(() => httpServer.close());

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
