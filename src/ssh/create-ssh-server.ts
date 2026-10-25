import ssh2 from 'ssh2';
import type { Config } from '../config/config.schema.js';
import type { Logger } from '../logging/create-logger.js';
import { listen } from '../net/listen.js';
import { handleClient } from './client-handlers.js';
import { ConnectionDeadlines } from './connection-deadlines.js';
import { loadOrCreateHostKey } from './host-key.js';
import { SessionRegistry } from './session-registry.js';
import type { SshServer } from './ssh-server.types.js';
import { createTcpListener } from './tcp-listener.js';

/** How long open sessions get to receive their goodbye before the process exits. */
const SHUTDOWN_GRACE_MS = 5000;

/** Loads (or generates) the host key; nothing listens until `listen`. */
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

  // Hard cap on raw TCP connections, above the session limit so that polite
  // "server full" messages can still be delivered. Not in @types/ssh2.
  (sshServer as unknown as { maxConnections: number }).maxConnections = config.maxSessions * 2;

  const tcpServer = createTcpListener(sshServer, {
    handshakeTimeoutMs: config.handshakeTimeoutMs,
    proxyProtocol: config.proxyProtocol,
    connectionDeadlines,
    logger,
  });

  async function shutdown(): Promise<void> {
    logger.info({ sessions: sessionRegistry.activeSessionCount }, 'shutting down');
    // close() stops accepting and calls back once every existing connection
    // has closed, i.e. once visitors have received their goodbye and their
    // ssh client has hung up. Exiting earlier would cut that message off.
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
