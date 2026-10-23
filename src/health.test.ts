import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createHealthServer } from './health.js';

let ready = true;
const server = createHealthServer(() => ready);
let base: string;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('/health is always 200', async () => {
  ready = false;
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('/ready follows the readiness callback', async () => {
  ready = true;
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  ready = false;
  assert.equal((await fetch(`${base}/ready`)).status, 503);
});

test('anything else is 404', async () => {
  assert.equal((await fetch(`${base}/`)).status, 404);
});
