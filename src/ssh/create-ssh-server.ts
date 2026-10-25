import type { AddressInfo } from 'node:net';
import ssh2 from 'ssh2';
import type { Config } from '../config/config.schema.js';
import type { Logger } from '../logging/create-logger.js';
import type { CvSession } from '../cv-session/cv-session.types.js';
import { handleClient } from './client-handlers.js';
import { ConnectionDeadlines } from './connection-deadlines.js';
import { loadOrCreateHostKey } from './host-key.js';
import { SessionLimiter } from './session-limits/session-limiter.js';
import type { SshServer } from './ssh-server.types.js';
import { createTcpListener } from './tcp-listener.js';

/** How long open sessions get to receive their goodbye before the process exits. */
const SHUTDOWN_GRACE_MS = 5000;

export function createSshServer(config: Config, logger: Logger): SshServer {
  const hostKey = loadOrCreateHostKey(config.hostKeyPath, logger);
  const sessionLimiter = new SessionLimiter(config.maxSessions, config.maxSessionsPerIp);
  const activeSessions = new Set<CvSession>();
  const connectionDeadlines = new ConnectionDeadlines();
  let isListening = false;
  let isShuttingDown = false;

  const sshServer = new ssh2.Server({ hostKeys: [hostKey] }, (client, clientInfo) =>
    handleClient(client, clientInfo, {
      config,
      logger,
      connectionDeadlines,
      sessionLimiter,
      activeSessions,
      isShuttingDown: () => isShuttingDown,
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

  const listening = new Promise<AddressInfo>((resolve, reject) => {
    tcpServer.once('error', reject);
    tcpServer.listen(config.sshPort, config.listenHost, () => {
      const address = tcpServer.address() as AddressInfo;
      isListening = true;
      logger.info({ host: address.address, port: address.port }, 'cv-ssh listening');
      resolve(address);
    });
  });

  return {
    listening,
    isReady: () => isListening && !isShuttingDown,
    async shutdown() {
      isShuttingDown = true;
      logger.info({ sessions: activeSessions.size }, 'shutting down');
      // close() stops accepting and calls back once every existing connection
      // has closed, i.e. once visitors have received their goodbye and their
      // ssh client has hung up. Exiting earlier would cut that message off.
      const drained = new Promise<void>((resolve) => tcpServer.close(() => resolve()));
      for (const cvSession of activeSessions) cvSession.end('shutdown');
      let graceTimer: NodeJS.Timeout | undefined;
      const grace = new Promise<void>((resolve) => (graceTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS)));
      await Promise.race([drained, grace]);
      clearTimeout(graceTimer);
    },
  };
}
