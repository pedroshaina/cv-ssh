import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ssh2 from 'ssh2';
import type { Logger } from '../logging/create-logger.js';

const MAX_GENERATION_ATTEMPTS = 10;

/** ssh2 occasionally generates a key its own parser rejects; a saved one would block every start. */
export function generateHostKey(): Buffer {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const privateKey = Buffer.from(ssh2.utils.generateKeyPairSync('ed25519').private);
    if (!(ssh2.utils.parseKey(privateKey) instanceof Error)) return privateKey;
  }
  throw new Error(`could not generate a usable host key in ${MAX_GENERATION_ATTEMPTS} attempts`);
}

/** Must persist: a new key shows returning visitors "REMOTE HOST IDENTIFICATION HAS CHANGED". */
export function loadOrCreateHostKey(path: string, logger: Logger): Buffer {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, generateHostKey(), { mode: 0o600 });
    logger.warn({ path }, 'generated new host key');
  }
  return readFileSync(path);
}
