import { isIP } from 'node:net';
import { V1_MAX_LENGTH } from './proxy-header.constants.js';
import type { ProxyHeader } from './proxy-header.types.js';

// "PROXY TCP4 203.0.113.7 10.0.0.5 51234 22\r\n" or "PROXY UNKNOWN ...\r\n"
export function parseV1(data: Buffer): ProxyHeader {
  const lineEnd = data.subarray(0, V1_MAX_LENGTH).indexOf('\r\n');
  if (lineEnd === -1) {
    return data.length < V1_MAX_LENGTH ? { kind: 'incomplete' } : { kind: 'invalid', reason: 'PROXY line too long' };
  }
  const length = lineEnd + 2;
  const [, protocol, sourceAddress, , sourcePort] = data.subarray(0, lineEnd).toString('latin1').split(' ');
  if (protocol === 'UNKNOWN') return { kind: 'header', length };

  const port = Number(sourcePort);
  const family = protocol === 'TCP4' ? 4 : protocol === 'TCP6' ? 6 : undefined;
  if (!family || !sourceAddress || isIP(sourceAddress) !== family || !Number.isInteger(port) || port < 0 || port > 65535) {
    return { kind: 'invalid', reason: 'malformed PROXY line' };
  }
  return { kind: 'header', length, source: { address: sourceAddress, port } };
}
