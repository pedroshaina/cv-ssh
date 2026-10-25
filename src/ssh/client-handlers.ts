import { randomBytes } from 'node:crypto';
import type { ClientInfo, Connection } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import type { ConnectionDeadlines } from './connection-deadlines.js';
import { refuseForwarding } from './forwarding-refusal.js';
import { handleSessionChannel, type SessionChannelContext } from './session-channel-handlers.js';

export type ClientContext = Omit<SessionChannelContext, 'connectionLogger' | 'clientIp' | 'onSessionStarted'> & {
  logger: Logger;
  connectionDeadlines: ConnectionDeadlines;
};

/** One SSH connection: authentication, then its session channels. */
export function handleClient(client: Connection, clientInfo: ClientInfo, context: ClientContext): void {
  const { logger, connectionDeadlines, ...sharedContext } = context;
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
        ...sharedContext,
        connectionLogger,
        clientIp: clientInfo.ip,
        onSessionStarted,
      });
    });
  });

  client.on('error', (error) => connectionLogger.debug({ err: error.message }, 'client error'));
  client.on('close', () => connectionLogger.debug('connection closed'));
}
