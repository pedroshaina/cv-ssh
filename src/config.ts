function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} must be true or false, got "${raw}"`);
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: intFromEnv('PORT', 2222),
  /** Plain HTTP for the cluster's /health and /ready probes. */
  healthPort: intFromEnv('HEALTH_PORT', 8080),
  hostKeyPath: process.env.HOST_KEY_PATH ?? '.data/host_ed25519',
  contentDir: process.env.CONTENT_DIR ?? 'content',

  /** Disconnect after this long without a keypress. */
  idleTimeoutMs: intFromEnv('IDLE_TIMEOUT_SECONDS', 180) * 1000,
  /** Concurrent CV sessions across all visitors. */
  maxSessions: intFromEnv('MAX_SESSIONS', 20),
  /** Concurrent CV sessions per client IP; 0 disables the check. */
  maxSessionsPerIp: intFromEnv('MAX_SESSIONS_PER_IP', 2),
  /** Time a client has to finish the SSH handshake and authenticate. */
  handshakeTimeoutMs: intFromEnv('HANDSHAKE_TIMEOUT_SECONDS', 30) * 1000,
  /**
   * Every connection must start with a PROXY protocol header from the relay in
   * front, which carries the visitor's real address. Connections without one
   * are dropped, so nobody can claim an address by sending their own.
   */
  proxyProtocol: boolFromEnv('PROXY_PROTOCOL', false),
};

export type Config = typeof config;
