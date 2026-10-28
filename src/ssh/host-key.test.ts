import assert from 'node:assert/strict';
import { test } from 'node:test';
import ssh2 from 'ssh2';
import { generateHostKey } from './host-key.js';

// ssh2 writes an unparseable key ~1 in 180 times, so 2000 tries would hit one.
test('every generated host key can be loaded by ssh2', () => {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const parsedKey = ssh2.utils.parseKey(generateHostKey());
    if (parsedKey instanceof Error) assert.fail(`attempt ${attempt}: ${parsedKey.message}`);
  }
});
