import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from './load-config.js';

/** Matches a ConfigError with a line naming `variableName`. */
function failsOn(variableName: string) {
  return (error: unknown) => error instanceof ConfigError && new RegExp(`^${variableName}: `, 'm').test(error.message);
}

test('defaults apply when nothing is set', () => {
  assert.deepEqual(loadConfig({}), {
    listenHost: '0.0.0.0',
    sshPort: 2222,
    httpPort: 8080,
    hostKeyPath: '.data/host_ed25519',
    contentDir: 'content',
    idleTimeoutMs: 180_000,
    maxSessions: 20,
    maxSessionsPerIp: 2,
    handshakeTimeoutMs: 30_000,
    proxyProtocol: false,
    logLevel: 'info',
  });
});

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

test('env values are read and seconds become milliseconds', () => {
  const config = loadConfig({ PORT: '22', IDLE_TIMEOUT_SECONDS: '5', PROXY_PROTOCOL: '1', LOG_LEVEL: 'debug' });
  assert.equal(config.sshPort, 22);
  assert.equal(config.idleTimeoutMs, 5000);
  assert.equal(config.proxyProtocol, true);
  assert.equal(config.logLevel, 'debug');
});

test('a bad integer names the variable and the value', () => {
  assert.throws(
    () => loadConfig({ PORT: 'abc' }),
    (error) => error instanceof ConfigError && /^PORT: .*"abc"/m.test(error.message),
  );
  assert.throws(() => loadConfig({ MAX_SESSIONS: '-1' }), ConfigError);
  assert.throws(() => loadConfig({ MAX_SESSIONS: '1.5' }), ConfigError);
});

test('booleans accept only true, false, 1 and 0', () => {
  assert.equal(loadConfig({ PROXY_PROTOCOL: 'false' }).proxyProtocol, false);
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'yes' }), failsOn('PROXY_PROTOCOL'));
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'TRUE' }), failsOn('PROXY_PROTOCOL'));
});

test('an unknown log level is refused', () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), failsOn('LOG_LEVEL'));
});

test('every problem is reported, not just the first', () => {
  assert.throws(
    () => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    (error) => error instanceof ConfigError && /^PORT: /m.test(error.message) && /^LOG_LEVEL: /m.test(error.message),
  );
});

test('ports must be between 0 and 65535', () => {
  assert.equal(loadConfig({ PORT: '65535', HEALTH_PORT: '0' }).sshPort, 65535);
  assert.throws(() => loadConfig({ PORT: '70000' }), failsOn('PORT'));
  assert.throws(() => loadConfig({ HEALTH_PORT: '65536' }), failsOn('HEALTH_PORT'));
});

test('timeouts and the session limit must be above 0, which would lock everyone out', () => {
  for (const variableName of ['IDLE_TIMEOUT_SECONDS', 'HANDSHAKE_TIMEOUT_SECONDS', 'MAX_SESSIONS']) {
    assert.throws(() => loadConfig({ [variableName]: '0' }), failsOn(variableName));
  }
  assert.equal(loadConfig({ MAX_SESSIONS_PER_IP: '0' }).maxSessionsPerIp, 0);
});
