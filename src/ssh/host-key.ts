import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ssh2 from 'ssh2';
import type { Logger } from '../logging/create-logger.js';

/** Tries before giving up; at ssh2's failure rate (~1 in 180) ten bad keys in a row never happen. */
const MAX_GENERATION_ATTEMPTS = 10;

/**
 * A new ed25519 private key in OpenSSH format. ssh2's generator occasionally
 * writes one that its own parser rejects, which would stop the server from
 * starting, and keep it from starting, since the key is saved. Only hand out
 * keys ssh2 can read back.
 */
export function generateHostKey(): Buffer {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const privateKey = Buffer.from(ssh2.utils.generateKeyPairSync('ed25519').private);
    if (!(ssh2.utils.parseKey(privateKey) instanceof Error)) return privateKey;
  }
  throw new Error(`could not generate a usable host key in ${MAX_GENERATION_ATTEMPTS} attempts`);
}

/**
 * The host key is the server's identity. If it changes, returning visitors get
 * a "REMOTE HOST IDENTIFICATION HAS CHANGED" warning, so it must persist.
 */
export function loadOrCreateHostKey(path: string, logger: Logger): Buffer {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, generateHostKey(), { mode: 0o600 });
    logger.warn({ path }, 'generated new host key');
  }
  return readFileSync(path);
}
