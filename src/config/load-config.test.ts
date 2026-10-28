import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from './load-config.js';

function failsOn(variableName: string) {
  return (error: unknown) => error instanceof ConfigError && new RegExp(`^${variableName}: `, 'm').test(error.message);
}

test('empty strings fall back to defaults, for every variable', () => {
  const variableNames = [
    'HOST',
    'PORT',
    'HEALTH_PORT',
    'HOST_KEY_PATH',
    'CONTENT_DIR',
    'IDLE_TIMEOUT_SECONDS',
    'MAX_SESSIONS',
    'MAX_SESSIONS_PER_IP',
    'HANDSHAKE_TIMEOUT_SECONDS',
    'PROXY_PROTOCOL',
    'LOG_LEVEL',
  ];
  const allEmpty = Object.fromEntries(variableNames.map((variableName) => [variableName, '']));
  assert.deepEqual(loadConfig(allEmpty), loadConfig({}));
});

test('timeouts are given in seconds', () => {
  const config = loadConfig({ IDLE_TIMEOUT_SECONDS: '5', HANDSHAKE_TIMEOUT_SECONDS: '7' });
  assert.equal(config.idleTimeoutMs, 5000);
  assert.equal(config.handshakeTimeoutMs, 7000);
});

test('a bad integer names the variable and the value', () => {
  assert.throws(
    () => loadConfig({ PORT: 'abc' }),
    (error) => error instanceof ConfigError && /^PORT: .*"abc"/m.test(error.message),
  );
  assert.throws(() => loadConfig({ MAX_SESSIONS: '-1' }), ConfigError);
  assert.throws(() => loadConfig({ MAX_SESSIONS: '1.5' }), ConfigError);
  assert.throws(() => loadConfig({ PORT: '70000' }), failsOn('PORT'));
});

test('booleans accept only true, false, 1 and 0', () => {
  assert.equal(loadConfig({ PROXY_PROTOCOL: '1' }).proxyProtocol, true);
  assert.equal(loadConfig({ PROXY_PROTOCOL: 'false' }).proxyProtocol, false);
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'yes' }), failsOn('PROXY_PROTOCOL'));
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'TRUE' }), failsOn('PROXY_PROTOCOL'));
});

test('every problem is reported, not just the first', () => {
  assert.throws(
    () => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    (error) => error instanceof ConfigError && /^PORT: /m.test(error.message) && /^LOG_LEVEL: /m.test(error.message),
  );
});

test('timeouts and the session limit must be above 0, which would lock everyone out', () => {
  for (const variableName of ['IDLE_TIMEOUT_SECONDS', 'HANDSHAKE_TIMEOUT_SECONDS', 'MAX_SESSIONS']) {
    assert.throws(() => loadConfig({ [variableName]: '0' }), failsOn(variableName));
  }
  assert.equal(loadConfig({ MAX_SESSIONS_PER_IP: '0' }).maxSessionsPerIp, 0);
});
