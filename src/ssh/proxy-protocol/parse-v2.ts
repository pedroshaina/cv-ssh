import { V2_FIXED_LENGTH } from './proxy-header.constants.js';
import type { ProxyHeader } from './proxy-header.types.js';

/** Binary v2 header: 16 fixed bytes (signature, version/command, family, length), then addresses. */
export function parseV2(data: Buffer): ProxyHeader {
  if (data.length < V2_FIXED_LENGTH) return { kind: 'incomplete' };
  const versionCommand = data.readUInt8(12);
  const familyProtocol = data.readUInt8(13);
  const length = V2_FIXED_LENGTH + data.readUInt16BE(14);
  if (versionCommand >> 4 !== 2) return { kind: 'invalid', reason: 'unsupported PROXY version' };
  if (data.length < length) return { kind: 'incomplete' };

  const command = versionCommand & 0x0f;
  if (command === 0x0) return { kind: 'header', length };
  if (command !== 0x1) return { kind: 'invalid', reason: 'unknown PROXY command' };

  // Source address and port; what follows (destination, TLVs) isn't needed.
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

/** Compressed form ("2001:db8::1"), as Node reports socket addresses. */
function formatIpv6Address(bytes: Buffer): string {
  const groups: string[] = [];
  for (let byteOffset = 0; byteOffset < 16; byteOffset += 2) groups.push(bytes.readUInt16BE(byteOffset).toString(16));
  return new URL(`http://[${groups.join(':')}]`).hostname.slice(1, -1);
}
