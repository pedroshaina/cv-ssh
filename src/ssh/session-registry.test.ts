import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionRegistry } from './session-registry.js';

function registry(maxSessions: number, maxSessionsPerIp: number): SessionRegistry {
  return new SessionRegistry({ maxSessions, maxSessionsPerIp });
}

test('refuses sessions beyond the global limit', () => {
  const sessionRegistry = registry(2, 0);
  assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, true);
  assert.equal(sessionRegistry.tryAdmit('2.2.2.2').ok, true);
  assert.deepEqual(sessionRegistry.tryAdmit('3.3.3.3'), { ok: false, reason: 'server-full' });
});

test('a per-IP limit of 0 disables the check', () => {
  const sessionRegistry = registry(10, 0);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, true);
});

test('once shutting down, new sessions are refused', () => {
  const sessionRegistry = registry(10, 0);
  sessionRegistry.endAll();
  assert.deepEqual(sessionRegistry.tryAdmit('1.1.1.1'), { ok: false, reason: 'shutdown' });
});
