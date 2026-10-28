import { createServer, isIP, type Server as TcpServer, type Socket } from 'node:net';
import type { Server as Ssh2Server } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import type { ConnectionDeadlines } from './connection-deadlines.js';
import type { ProxySource } from './proxy-protocol/parse-proxy-header.js';
import { readProxyHeader } from './proxy-protocol/read-proxy-header.js';

export interface TcpListenerOptions {
  handshakeTimeoutMs: number;
  proxyProtocol: boolean;
  connectionDeadlines: ConnectionDeadlines;
  logger: Logger;
}

/**
 * ssh2 has no timeouts, so a client that stalls before its shell starts would
 * hold a slot forever. Every socket gets a deadline the SSH layer clears.
 */
export function createTcpListener(sshServer: Ssh2Server, options: TcpListenerOptions): TcpServer {
  const { handshakeTimeoutMs, proxyProtocol, connectionDeadlines, logger } = options;

  return createServer((socket) => {
    const connectionDeadline = setTimeout(() => {
      logger.info({ peer: socket.remoteAddress }, 'connection timed out before its session started');
      socket.destroy();
    }, handshakeTimeoutMs);
    socket.once('close', () => clearTimeout(connectionDeadline));

    // Until ssh2 attaches its own handler, an error here would crash the process.
    const onEarlyError = (error: Error) => {
      logger.debug({ peer: socket.remoteAddress, err: error }, 'connection error before handover');
      socket.destroy();
    };
    socket.on('error', onEarlyError);

    // ssh2 resumes the socket itself once its data listener is attached.
    const handOver = (earlySshBytes?: Buffer) => {
      if (!connectionDeadlines.register(socket, connectionDeadline)) {
        logger.warn(
          { peer: socket.remoteAddress, port: socket.remotePort },
          'connection dropped: address already in use',
        );
        socket.destroy();
        return;
      }
      if (earlySshBytes?.length) socket.unshift(earlySshBytes);
      socket.off('error', onEarlyError);
      sshServer.injectSocket(socket);
    };

    if (!proxyProtocol) return handOver();

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

/** ssh2 reads the client's address from the socket, which would be the relay's. */
function applyProxiedAddress(socket: Socket, source: ProxySource): void {
  Object.defineProperties(socket, {
    remoteAddress: { value: source.address },
    remotePort: { value: source.port },
    remoteFamily: { value: isIP(source.address) === 6 ? 'IPv6' : 'IPv4' },
  });
}
