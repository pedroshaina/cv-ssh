import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ssh2 from 'ssh2';
import type { Logger } from '../logging/create-logger.js';

/**
 * The host key is the server's identity. If it changes, returning visitors get
 * a "REMOTE HOST IDENTIFICATION HAS CHANGED" warning, so it must persist.
 */
export function loadOrCreateHostKey(path: string, logger: Logger): Buffer {
  if (!existsSync(path)) {
    const { private: privateKey } = ssh2.utils.generateKeyPairSync('ed25519');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, privateKey, { mode: 0o600 });
    logger.warn({ path }, 'generated new host key');
  }
  return readFileSync(path);
}
