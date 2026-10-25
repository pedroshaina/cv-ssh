import type { Connection, ServerChannel } from 'ssh2';
import { RESTART_MESSAGE } from '../cv-session/goodbye-messages.constants.js';
import type { Logger } from '../logging/create-logger.js';
import type { RefusalReason } from './session-registry.js';

/** What a visitor reads when the server refuses their session. */
export const REFUSAL_MESSAGES: Record<
  RefusalReason | 'no-terminal' | 'commands-unsupported' | 'unavailable',
  string
> = {
  'server-full': 'Too many visitors right now. Please try again in a minute.',
  'ip-limit': 'You already have the maximum number of sessions open from this address.',
  'shutdown': RESTART_MESSAGE,
  'no-terminal': 'This CV is interactive and needs a terminal. Try: ssh -t <host>',
  'commands-unsupported': 'Commands are not supported here. Connect with plain ssh to browse the CV.',
  'unavailable': 'Something went wrong on our side. Please try again in a little while.',
};

/** Tells the visitor why, then closes the channel with a failing exit status. */
export function refuseChannel(channel: ServerChannel, message: string): void {
  channel.write(`${message}\r\n`);
  channel.exit(1);
  channel.end();
}

/**
 * Forwarding would turn the server into a proxy into whatever network it
 * runs in. ssh2 already rejects request types nobody listens for; these
 * handlers make that explicit, so adding a listener elsewhere can't
 * silently enable it, and log each attempt. No real visitor's ssh client
 * sends these, so every line is someone probing.
 */
export function refuseForwarding(client: Connection, connectionLogger: Logger): void {
  client.on('tcpip', (_accept, reject, { destIP, destPort }) => {
    connectionLogger.warn({ kind: 'direct-tcpip', dest: `${destIP}:${destPort}` }, 'forwarding refused');
    reject();
  });
  client.on('openssh.streamlocal', (_accept, reject, { socketPath }) => {
    connectionLogger.warn({ kind: 'direct-streamlocal', dest: socketPath }, 'forwarding refused');
    reject();
  });
  client.on('request', (_accept, reject, requestName, requestInfo) => {
    if (!requestName.startsWith('cancel-')) {
      const bind =
        'socketPath' in requestInfo ? requestInfo.socketPath : `${requestInfo.bindAddr}:${requestInfo.bindPort}`;
      connectionLogger.warn({ kind: requestName, bind }, 'forwarding refused');
    }
    reject?.();
  });
}
