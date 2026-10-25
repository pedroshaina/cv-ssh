import { randomBytes } from 'node:crypto';
import type { ClientInfo, Connection } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import type { ConnectionDeadlines } from './connection-deadlines.js';
import { refuseForwarding } from './forwarding-refusal.js';
import { handleSessionChannel } from './session-channel-handlers.js';
import type { SessionRegistry } from './session-registry.js';

export interface ClientContext {
  logger: Logger;
  connectionDeadlines: ConnectionDeadlines;
  sessionRegistry: SessionRegistry;
  contentDir: string;
  idleTimeoutMs: number;
}

/** One SSH connection: authentication, then its session channels. */
export function handleClient(client: Connection, clientInfo: ClientInfo, context: ClientContext): void {
  const { logger, connectionDeadlines, sessionRegistry, contentDir, idleTimeoutMs } = context;
  const connectionLogger = logger.child({ conn: randomBytes(4).toString('hex'), ip: clientInfo.ip });
  connectionLogger.debug({ client: clientInfo.header.versions.software }, 'connection opened');

  // The TCP listener drops the connection unless a shell starts in time.
  const connectionDeadline = connectionDeadlines.claim(clientInfo.ip, clientInfo.port);
  if (!connectionDeadline) connectionLogger.warn({ port: clientInfo.port }, 'no connection deadline found');
  const onSessionStarted = () => clearTimeout(connectionDeadline);

  // A public CV: let everyone in, whatever auth method their client tries first.
  client.on('authentication', (authContext) => authContext.accept());

  client.on('ready', () => {
    refuseForwarding(client, connectionLogger);
    client.on('session', (acceptSession) => {
      handleSessionChannel(acceptSession(), {
        connectionLogger,
        clientIp: clientInfo.ip,
        sessionRegistry,
        contentDir,
        idleTimeoutMs,
        onSessionStarted,
      });
    });
  });

  client.on('error', (error) => connectionLogger.debug({ err: error.message }, 'client error'));
  client.on('close', () => connectionLogger.debug('connection closed'));
}
