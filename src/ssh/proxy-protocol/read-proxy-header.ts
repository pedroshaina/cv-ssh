import type { Socket } from 'node:net';
import { parseProxyHeader, type ProxySource } from './parse-proxy-header.js';

/** A complete header read off a socket, with the SSH bytes that arrived after it. */
export type ProxyHeaderReadResult =
  | { kind: 'header'; source?: ProxySource; remainingBytes: Buffer }
  | { kind: 'invalid'; reason: string };

/**
 * Buffers what the socket sends until a whole PROXY header has arrived, then
 * stops reading and pauses the socket so no SSH bytes are lost before the
 * caller hands it on. Logging and dropping bad connections is the caller's job.
 */
export function readProxyHeader(socket: Socket): Promise<ProxyHeaderReadResult> {
  return new Promise((resolve) => {
    let receivedBytes = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      receivedBytes = Buffer.concat([receivedBytes, chunk]);
      const header = parseProxyHeader(receivedBytes);
      if (header.kind === 'incomplete') return;
      socket.off('data', onData);
      socket.pause();
      if (header.kind === 'invalid') {
        resolve(header);
        return;
      }
      resolve({ kind: 'header', source: header.source, remainingBytes: receivedBytes.subarray(header.length) });
    };
    socket.on('data', onData);
  });
}
