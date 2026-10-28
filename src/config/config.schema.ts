import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** An empty variable (`PORT=`) counts as unset, so it gets the default. */
function emptyAsUnset<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema);
}

function integerInRange(defaultValue: number, min: number, max: number, expected: string) {
  return emptyAsUnset(
    z
      .string()
      .default(String(defaultValue))
      .transform((raw, context) => {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < min || value > max) {
          context.addIssue({ code: 'custom', message: `expected ${expected}, got "${raw}"` });
          return z.NEVER;
        }
        return value;
      }),
  );
}

/** 0 lets the OS pick a free port, which tests rely on. */
function port(defaultValue: number) {
  return integerInRange(defaultValue, 0, 65535, 'a port from 0 to 65535');
}

function positiveInteger(defaultValue: number) {
  return integerInRange(defaultValue, 1, Number.MAX_SAFE_INTEGER, 'a positive integer');
}

function nonNegativeInteger(defaultValue: number) {
  return integerInRange(defaultValue, 0, Number.MAX_SAFE_INTEGER, 'a non-negative integer');
}

function text(defaultValue: string) {
  return emptyAsUnset(z.string().default(defaultValue));
}

function flag(defaultValue: boolean) {
  return emptyAsUnset(
    z
      .stringbool({
        truthy: ['true', '1'],
        falsy: ['false', '0'],
        case: 'sensitive',
        error: (issue) => `expected true or false, got "${String(issue.input)}"`,
      })
      .default(defaultValue),
  );
}

/** Keyed by environment variable name, so validation errors name the variable to fix. */
export const configSchema = z
  .object({
    HOST: text('0.0.0.0'),
    PORT: port(2222),
    HEALTH_PORT: port(8080),
    HOST_KEY_PATH: text('.data/host_ed25519'),
    CONTENT_DIR: text('content'),
    IDLE_TIMEOUT_SECONDS: positiveInteger(180),
    MAX_SESSIONS: positiveInteger(20),
    MAX_SESSIONS_PER_IP: nonNegativeInteger(2),
    HANDSHAKE_TIMEOUT_SECONDS: positiveInteger(30),
    PROXY_PROTOCOL: flag(false),
    LOG_LEVEL: emptyAsUnset(
      z
        .enum(LOG_LEVELS, {
          error: (issue) => `expected one of ${LOG_LEVELS.join(', ')}, got "${String(issue.input)}"`,
        })
        .default('info'),
    ),
  })
  .transform((env) => ({
    listenHost: env.HOST,
    sshPort: env.PORT,
    /** Plain HTTP for the cluster's /health and /ready probes. */
    httpPort: env.HEALTH_PORT,
    hostKeyPath: env.HOST_KEY_PATH,
    contentDir: env.CONTENT_DIR,

    /** Disconnect after this long without a keypress. */
    idleTimeoutMs: env.IDLE_TIMEOUT_SECONDS * 1000,
    /** Concurrent CV sessions across all visitors. */
    maxSessions: env.MAX_SESSIONS,
    /** Concurrent CV sessions per client IP; 0 disables the check. */
    maxSessionsPerIp: env.MAX_SESSIONS_PER_IP,
    /** Time a client has, from connecting, to authenticate and open its shell. */
    handshakeTimeoutMs: env.HANDSHAKE_TIMEOUT_SECONDS * 1000,
    /**
     * Every connection must start with a PROXY protocol header from the relay in
     * front, which carries the visitor's real address. Connections without one
     * are dropped, so nobody can claim an address by sending their own.
     */
    proxyProtocol: env.PROXY_PROTOCOL,
    logLevel: env.LOG_LEVEL,
  }));

export type Config = z.output<typeof configSchema>;
