// PROXY protocol (https://www.haproxy.org/download/2.9/doc/proxy-protocol.txt):
// a relay in front of the server sends one header with the visitor's address
// before the SSH bytes, so the server sees the visitor rather than the relay.
import { parseV1 } from './parse-v1.js';
import { parseV2 } from './parse-v2.js';
import { V1_PREFIX, V2_SIGNATURE } from './proxy-header.constants.js';
import type { ProxyHeader } from './proxy-header.types.js';

export function parseProxyHeader(data: Buffer): ProxyHeader {
  if (startsWith(data, V2_SIGNATURE)) return parseV2(data);
  if (startsWith(data, V1_PREFIX)) return parseV1(data);
  // Not a header yet, unless the bytes so far could still become one.
  const prefix = data.subarray(0, V2_SIGNATURE.length);
  if (V2_SIGNATURE.subarray(0, prefix.length).equals(prefix) || V1_PREFIX.subarray(0, prefix.length).equals(prefix)) {
    return { kind: 'incomplete' };
  }
  return { kind: 'invalid', reason: 'no PROXY header' };
}

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return data.length >= prefix.length && data.subarray(0, prefix.length).equals(prefix);
}
