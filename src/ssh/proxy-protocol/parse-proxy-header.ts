// https://www.haproxy.org/download/2.9/doc/proxy-protocol.txt
import { isIP } from 'node:net';

export interface ProxySource {
  address: string;
  port: number;
}

export type ProxyHeader =
  | { kind: 'incomplete' }
  | { kind: 'invalid'; reason: string }
  /** No `source`: the relay connected on its own behalf (e.g. a health check). */
  | { kind: 'header'; length: number; source?: ProxySource };

const V2_SIGNATURE = Buffer.from('\r\n\r\n\0\r\nQUIT\n', 'latin1');
const V2_FIXED_LENGTH = 16;
const V1_PREFIX = Buffer.from('PROXY ', 'latin1');
const V1_MAX_LENGTH = 107;

export function parseProxyHeader(data: Buffer): ProxyHeader {
  if (startsWith(data, V2_SIGNATURE)) return parseV2(data);
  if (startsWith(data, V1_PREFIX)) return parseV1(data);
  const prefix = data.subarray(0, V2_SIGNATURE.length);
  if (V2_SIGNATURE.subarray(0, prefix.length).equals(prefix) || V1_PREFIX.subarray(0, prefix.length).equals(prefix)) {
    return { kind: 'incomplete' };
  }
  return { kind: 'invalid', reason: 'no PROXY header' };
}

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return data.length >= prefix.length && data.subarray(0, prefix.length).equals(prefix);
}

function parseV1(data: Buffer): ProxyHeader {
  const lineEnd = data.subarray(0, V1_MAX_LENGTH).indexOf('\r\n');
  if (lineEnd === -1) {
    return data.length < V1_MAX_LENGTH ? { kind: 'incomplete' } : { kind: 'invalid', reason: 'PROXY line too long' };
  }
  const length = lineEnd + 2;
  const [, protocol, sourceAddress, , sourcePort] = data.subarray(0, lineEnd).toString('latin1').split(' ');
  if (protocol === 'UNKNOWN') return { kind: 'header', length };

  const port = Number(sourcePort);
  const family = protocol === 'TCP4' ? 4 : protocol === 'TCP6' ? 6 : undefined;
  if (
    !family ||
    !sourceAddress ||
    isIP(sourceAddress) !== family ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  ) {
    return { kind: 'invalid', reason: 'malformed PROXY line' };
  }
  return { kind: 'header', length, source: { address: sourceAddress, port } };
}

function parseV2(data: Buffer): ProxyHeader {
  if (data.length < V2_FIXED_LENGTH) return { kind: 'incomplete' };
  const versionCommand = data.readUInt8(12);
  const familyProtocol = data.readUInt8(13);
  const length = V2_FIXED_LENGTH + data.readUInt16BE(14);
  if (versionCommand >> 4 !== 2) return { kind: 'invalid', reason: 'unsupported PROXY version' };
  if (data.length < length) return { kind: 'incomplete' };

  const command = versionCommand & 0x0f;
  if (command === 0x0) return { kind: 'header', length };
  if (command !== 0x1) return { kind: 'invalid', reason: 'unknown PROXY command' };

  const addressBlock = data.subarray(V2_FIXED_LENGTH, length);
  switch (familyProtocol) {
    case 0x11: // TCP over IPv4
      if (addressBlock.length < 12) return { kind: 'invalid', reason: 'short IPv4 address block' };
      return {
        kind: 'header',
        length,
        source: { address: [...addressBlock.subarray(0, 4)].join('.'), port: addressBlock.readUInt16BE(8) },
      };
    case 0x21: // TCP over IPv6
      if (addressBlock.length < 36) return { kind: 'invalid', reason: 'short IPv6 address block' };
      return {
        kind: 'header',
        length,
        source: { address: formatIpv6Address(addressBlock.subarray(0, 16)), port: addressBlock.readUInt16BE(32) },
      };
    default: // UNSPEC, UDP or Unix sockets: nothing usable
      return { kind: 'header', length };
  }
}

/** Compressed, as Node reports socket addresses, so per-IP limits match. */
function formatIpv6Address(bytes: Buffer): string {
  const groups: string[] = [];
  for (let byteOffset = 0; byteOffset < 16; byteOffset += 2) groups.push(bytes.readUInt16BE(byteOffset).toString(16));
  return new URL(`http://[${groups.join(':')}]`).hostname.slice(1, -1);
}
