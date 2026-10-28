import type { AddressInfo } from 'node:net';
import ssh2 from 'ssh2';
import type { Config } from '../config/config.schema.js';
import type { Logger } from '../logging/create-logger.js';
import { listen } from '../net/listen.js';
import { handleClient } from './client-handlers.js';
import { ConnectionDeadlines } from './connection-deadlines.js';
import { loadOrCreateHostKey } from './host-key.js';
import { SessionRegistry } from './session-registry.js';
import { createTcpListener } from './tcp-listener.js';

export interface SshServer {
  listen(port: number, host: string): Promise<AddressInfo>;
  isReady: () => boolean;
  shutdown(): Promise<void>;
}

const SHUTDOWN_GRACE_MS = 5000;

export function createSshServer(config: Config, logger: Logger): SshServer {
  const hostKey = loadOrCreateHostKey(config.hostKeyPath, logger);
  const sessionRegistry = new SessionRegistry({
    maxSessions: config.maxSessions,
    maxSessionsPerIp: config.maxSessionsPerIp,
  });
  const connectionDeadlines = new ConnectionDeadlines();
  let isListening = false;
  let shutdownDone: Promise<void> | undefined;

  const sshServer = new ssh2.Server({ hostKeys: [hostKey] }, (client, clientInfo) =>
    handleClient(client, clientInfo, {
      logger,
      connectionDeadlines,
      sessionRegistry,
      contentDir: config.contentDir,
      idleTimeoutMs: config.idleTimeoutMs,
    }),
  );

  // Above the session limit so "server full" can still be delivered. Not in @types/ssh2.
  (sshServer as unknown as { maxConnections: number }).maxConnections = config.maxSessions * 2;

  const tcpServer = createTcpListener(sshServer, {
    handshakeTimeoutMs: config.handshakeTimeoutMs,
    proxyProtocol: config.proxyProtocol,
    connectionDeadlines,
    logger,
  });

  async function shutdown(): Promise<void> {
    logger.info({ sessions: sessionRegistry.activeSessionCount }, 'shutting down');
    // Calls back once every client has hung up, i.e. after its goodbye arrived.
    const drained = new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    sessionRegistry.endAll();
    let graceTimer: NodeJS.Timeout | undefined;
    const grace = new Promise<void>((resolve) => (graceTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS)));
    await Promise.race([drained, grace]);
    clearTimeout(graceTimer);
  }

  return {
    async listen(port, host) {
      const address = await listen(tcpServer, port, host);
      isListening = true;
      return address;
    },
    isReady: () => isListening && !sessionRegistry.isShuttingDown,
    shutdown: () => (shutdownDone ??= shutdown()),
  };
}
