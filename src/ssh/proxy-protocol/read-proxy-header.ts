import type { Socket } from 'node:net';
import { parseProxyHeader, type ProxySource } from './parse-proxy-header.js';

export type ProxyHeaderReadResult =
  { kind: 'header'; source?: ProxySource; remainingBytes: Buffer } | { kind: 'invalid'; reason: string };

/** Leaves the socket paused, so no SSH bytes are lost before it is handed on. */
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
