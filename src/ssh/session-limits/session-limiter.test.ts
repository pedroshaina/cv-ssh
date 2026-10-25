import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionLimiter } from './session-limiter.js';

test('refuses sessions beyond the global limit', () => {
  const sessionLimiter = new SessionLimiter(2, 0);
  assert.equal(sessionLimiter.tryAcquire('1.1.1.1').ok, true);
  assert.equal(sessionLimiter.tryAcquire('2.2.2.2').ok, true);
  assert.deepEqual(sessionLimiter.tryAcquire('3.3.3.3'), { ok: false, reason: 'server-full' });
});

test('refuses sessions beyond the per-IP limit, but not other IPs', () => {
  const sessionLimiter = new SessionLimiter(10, 2);
  sessionLimiter.tryAcquire('1.1.1.1');
  sessionLimiter.tryAcquire('1.1.1.1');
  assert.deepEqual(sessionLimiter.tryAcquire('1.1.1.1'), { ok: false, reason: 'ip-limit' });
  assert.equal(sessionLimiter.tryAcquire('2.2.2.2').ok, true);
});

test('a per-IP limit of 0 disables the check', () => {
  const sessionLimiter = new SessionLimiter(10, 0);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(sessionLimiter.tryAcquire('1.1.1.1').ok, true);
});

test('release frees the slot exactly once', () => {
  const sessionLimiter = new SessionLimiter(1, 1);
  const first = sessionLimiter.tryAcquire('1.1.1.1');
  assert.ok(first.ok);
  first.release();
  first.release();
  assert.equal(sessionLimiter.activeSessionCount, 0);
  assert.equal(sessionLimiter.tryAcquire('1.1.1.1').ok, true);
  assert.equal(sessionLimiter.tryAcquire('1.1.1.1').ok, false);
});
