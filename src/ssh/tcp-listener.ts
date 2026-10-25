import { createServer, type Server as TcpServer } from 'node:net';
import type { Server as Ssh2Server } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import { applyProxiedAddress } from './proxy-protocol/apply-proxied-address.js';
import { readProxyHeader } from './proxy-protocol/read-proxy-header.js';

export interface TcpListenerOptions {
  handshakeTimeoutMs: number;
  proxyProtocol: boolean;
  logger: Logger;
}

/**
 * ssh2 only calls its connection handler once the client has sent its version
 * line, so a socket that stays silent would hold a connection slot forever.
 * Own the TCP listener and drop sockets that never speak.
 */
export function createTcpListener(sshServer: Ssh2Server, options: TcpListenerOptions): TcpServer {
  const { handshakeTimeoutMs, proxyProtocol, logger } = options;

  return createServer((socket) => {
    const silenceTimer = setTimeout(() => socket.destroy(), handshakeTimeoutMs);
    socket.once('close', () => clearTimeout(silenceTimer));

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
      if (earlySshBytes?.length) {
        clearTimeout(silenceTimer);
        socket.unshift(earlySshBytes);
      } else {
        socket.once('data', () => clearTimeout(silenceTimer));
      }
      socket.off('error', onEarlyError);
      sshServer.injectSocket(socket);
    };

    if (!proxyProtocol) return handOver();

    // The silence timer also bounds how long the header may take to arrive.
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
