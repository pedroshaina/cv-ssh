import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CvSession, EndReason } from '../cv-session/cv-session.types.js';
import { SessionRegistry } from './session-registry.js';

function registry(maxSessions: number, maxSessionsPerIp: number): SessionRegistry {
  return new SessionRegistry({ maxSessions, maxSessionsPerIp });
}

/** A session that records how it was ended. */
function fakeSession(): CvSession & { endedWith?: EndReason } {
  const session: CvSession & { endedWith?: EndReason } = {
    resize: () => {},
    end: (endReason) => (session.endedWith = endReason),
    done: Promise.resolve(),
  };
  return session;
}

test('refuses sessions beyond the global limit', () => {
  const sessionRegistry = registry(2, 0);
  assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, true);
  assert.equal(sessionRegistry.tryAdmit('2.2.2.2').ok, true);
  assert.deepEqual(sessionRegistry.tryAdmit('3.3.3.3'), { ok: false, reason: 'server-full' });
});

test('refuses sessions beyond the per-IP limit, but not other IPs', () => {
  const sessionRegistry = registry(10, 2);
  sessionRegistry.tryAdmit('1.1.1.1');
  sessionRegistry.tryAdmit('1.1.1.1');
  assert.deepEqual(sessionRegistry.tryAdmit('1.1.1.1'), { ok: false, reason: 'ip-limit' });
  assert.equal(sessionRegistry.tryAdmit('2.2.2.2').ok, true);
});

test('a per-IP limit of 0 disables the check', () => {
  const sessionRegistry = registry(10, 0);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, true);
});

test('release frees the slot exactly once', () => {
  const sessionRegistry = registry(1, 1);
  const first = sessionRegistry.tryAdmit('1.1.1.1');
  assert.ok(first.ok);
  first.slot.release();
  first.slot.release();
  assert.equal(sessionRegistry.activeSessionCount, 0);
  assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, true);
  assert.equal(sessionRegistry.tryAdmit('1.1.1.1').ok, false);
});

test('endAll ends every held session and refuses new ones', () => {
  const sessionRegistry = registry(10, 0);
  const admission = sessionRegistry.tryAdmit('1.1.1.1');
  assert.ok(admission.ok);
  const session = fakeSession();
  admission.slot.hold(session);

  sessionRegistry.endAll();
  assert.equal(session.endedWith, 'shutdown');
  assert.equal(sessionRegistry.isShuttingDown, true);
  assert.deepEqual(sessionRegistry.tryAdmit('2.2.2.2'), { ok: false, reason: 'shutdown' });
});

test('endAll leaves sessions that have already ended alone', () => {
  const sessionRegistry = registry(10, 0);
  const admission = sessionRegistry.tryAdmit('1.1.1.1');
  assert.ok(admission.ok);
  const session = fakeSession();
  admission.slot.hold(session);
  admission.slot.release();

  sessionRegistry.endAll();
  assert.equal(session.endedWith, undefined);
});
