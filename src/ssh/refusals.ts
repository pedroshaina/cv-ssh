import type { Connection, ServerChannel } from 'ssh2';
import { RESTART_MESSAGE } from '../cv-session/goodbye-messages.constants.js';
import type { Logger } from '../logging/create-logger.js';
import type { RefusalReason } from './session-registry.js';

type RefusalMessageKey = RefusalReason | 'no-terminal' | 'commands-unsupported' | 'unavailable';

export const REFUSAL_MESSAGES: Record<RefusalMessageKey, string> = {
  'server-full': 'Too many visitors right now. Please try again in a minute.',
  'ip-limit': 'You already have the maximum number of sessions open from this address.',
  shutdown: RESTART_MESSAGE,
  'no-terminal': 'This CV is interactive and needs a terminal. Try: ssh -t <host>',
  'commands-unsupported': 'Commands are not supported here. Connect with plain ssh to browse the CV.',
  unavailable: 'Something went wrong on our side. Please try again in a little while.',
};

export function refuseChannel(channel: ServerChannel, message: string): void {
  channel.write(`${message}\r\n`);
  channel.exit(1);
  channel.end();
}

/**
 * Forwarding would make the server a proxy into its network. ssh2 already
 * rejects unhandled requests; this makes it explicit and logs the probing.
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
