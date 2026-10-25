import assert from 'node:assert/strict';
import { test } from 'node:test';
import ssh2 from 'ssh2';
import { generateHostKey } from './host-key.js';

// ssh2's own generator writes an unparseable ed25519 key about once in 180
// tries, so 2000 keys would all but certainly include one if nothing checked.
test('every generated host key can be loaded by ssh2', () => {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const parsedKey = ssh2.utils.parseKey(generateHostKey());
    assert.ok(!(parsedKey instanceof Error), `attempt ${attempt}: ${String(parsedKey)}`);
  }
});
