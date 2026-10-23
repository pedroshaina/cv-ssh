import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionLimiter } from './limits.js';

test('refuses sessions beyond the global limit', () => {
  const limiter = new SessionLimiter(2, 0);
  assert.equal(limiter.tryAcquire('1.1.1.1').ok, true);
  assert.equal(limiter.tryAcquire('2.2.2.2').ok, true);
  assert.deepEqual(limiter.tryAcquire('3.3.3.3'), { ok: false, reason: 'server-full' });
});

test('refuses sessions beyond the per-IP limit, but not other IPs', () => {
  const limiter = new SessionLimiter(10, 2);
  limiter.tryAcquire('1.1.1.1');
  limiter.tryAcquire('1.1.1.1');
  assert.deepEqual(limiter.tryAcquire('1.1.1.1'), { ok: false, reason: 'ip-limit' });
  assert.equal(limiter.tryAcquire('2.2.2.2').ok, true);
});

test('a per-IP limit of 0 disables the check', () => {
  const limiter = new SessionLimiter(10, 0);
  for (let i = 0; i < 5; i++) assert.equal(limiter.tryAcquire('1.1.1.1').ok, true);
});

test('release frees the slot exactly once', () => {
  const limiter = new SessionLimiter(1, 1);
  const first = limiter.tryAcquire('1.1.1.1');
  assert.ok(first.ok);
  first.release();
  first.release();
  assert.equal(limiter.active, 0);
  assert.equal(limiter.tryAcquire('1.1.1.1').ok, true);
  assert.equal(limiter.tryAcquire('1.1.1.1').ok, false);
});
