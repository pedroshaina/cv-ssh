import { randomBytes } from 'node:crypto';
import type { ClientInfo, Connection } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';
import { refuseForwarding } from './forwarding-refusal.js';
import { handleSessionChannel, type SessionChannelContext } from './session-channel-handlers.js';

export type ClientContext = Omit<SessionChannelContext, 'connectionLogger' | 'clientIp'> & { logger: Logger };

/** One SSH connection: authentication, handshake deadline, then its session channels. */
export function handleClient(client: Connection, clientInfo: ClientInfo, context: ClientContext): void {
  const { logger, ...sharedContext } = context;
  const connectionLogger = logger.child({ conn: randomBytes(4).toString('hex'), ip: clientInfo.ip });
  connectionLogger.debug({ client: clientInfo.header.versions.software }, 'connection opened');

  // Drop clients that connect but never finish authenticating.
  const handshakeTimer = setTimeout(() => {
    connectionLogger.info('handshake timed out');
    client.end();
  }, context.config.handshakeTimeoutMs);

  // A public CV: let everyone in, whatever auth method their client tries first.
  client.on('authentication', (authContext) => authContext.accept());

  client.on('ready', () => {
    clearTimeout(handshakeTimer);
    refuseForwarding(client, connectionLogger);
    client.on('session', (acceptSession) => {
      handleSessionChannel(acceptSession(), { ...sharedContext, connectionLogger, clientIp: clientInfo.ip });
    });
  });

  client.on('error', (error) => connectionLogger.debug({ err: error.message }, 'client error'));
  client.on('close', () => {
    clearTimeout(handshakeTimer);
    connectionLogger.debug('connection closed');
  });
}
