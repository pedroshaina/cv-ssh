import { isIP, type Socket } from 'node:net';
import type { ProxySource } from './proxy-header.types.js';

/**
 * ssh2 reads the client's address from the socket. Behind a relay that is the
 * relay's address, so overlay the visitor's, from the PROXY header.
 */
export function applyProxiedAddress(socket: Socket, source: ProxySource): void {
  Object.defineProperties(socket, {
    remoteAddress: { value: source.address },
    remotePort: { value: source.port },
    remoteFamily: { value: isIP(source.address) === 6 ? 'IPv6' : 'IPv4' },
  });
}
