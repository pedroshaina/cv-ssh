import { createServer, type Server as TcpServer } from 'node:net';
import type { Server as Ssh2Server } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import type { ConnectionDeadlines } from './connection-deadlines.js';
import { applyProxiedAddress } from './proxy-protocol/apply-proxied-address.js';
import { readProxyHeader } from './proxy-protocol/read-proxy-header.js';

export interface TcpListenerOptions {
  handshakeTimeoutMs: number;
  proxyProtocol: boolean;
  connectionDeadlines: ConnectionDeadlines;
  logger: Logger;
}

/**
 * ssh2 has no timeouts of its own, so a client that goes quiet at any point
 * before its shell starts (before its version line, mid-handshake, or after
 * authenticating) would hold a connection slot forever. Own the TCP listener
 * and give every socket a deadline, which the SSH layer clears once a shell
 * starts.
 */
export function createTcpListener(sshServer: Ssh2Server, options: TcpListenerOptions): TcpServer {
  const { handshakeTimeoutMs, proxyProtocol, connectionDeadlines, logger } = options;

  return createServer((socket) => {
    const connectionDeadline = setTimeout(() => {
      logger.info({ peer: socket.remoteAddress }, 'connection timed out before its session started');
      socket.destroy();
    }, handshakeTimeoutMs);
    socket.once('close', () => clearTimeout(connectionDeadline));

    // Until ssh2 takes the socket and attaches its own handler, an error (a
    // client resetting mid PROXY header) would otherwise be uncaught and
    // crash the process.
    const onEarlyError = (error: Error) => {
      logger.debug({ peer: socket.remoteAddress, err: error.message }, 'connection error before handover');
      socket.destroy();
    };
    socket.on('error', onEarlyError);

    // Hands the socket to ssh2, `earlySshBytes` being SSH bytes already read.
    // ssh2 resumes the socket itself once its data listener is attached.
    const handOver = (earlySshBytes?: Buffer) => {
      if (!connectionDeadlines.register(socket, connectionDeadline)) {
        logger.warn({ peer: socket.remoteAddress, port: socket.remotePort }, 'connection dropped: address already in use');
        socket.destroy();
        return;
      }
      if (earlySshBytes?.length) socket.unshift(earlySshBytes);
      socket.off('error', onEarlyError);
      sshServer.injectSocket(socket);
    };

    if (!proxyProtocol) return handOver();

    // The connection deadline also bounds how long the header may take to arrive.
    void readProxyHeader(socket).then((header) => {
      if (header.kind === 'invalid') {
        logger.warn({ peer: socket.remoteAddress, reason: header.reason }, 'connection dropped');
        socket.destroy();
        return;
      }
      if (header.source) applyProxiedAddress(socket, header.source);
      handOver(header.remainingBytes);
    });
  });
}
