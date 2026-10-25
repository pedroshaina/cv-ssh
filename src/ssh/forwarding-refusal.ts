import type { Connection } from 'ssh2';
import type { Logger } from '../logging/create-logger.js';

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
