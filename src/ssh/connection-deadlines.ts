import type { Socket } from 'node:net';

/**
 * Hands each connection's deadline from the TCP listener to the SSH layer.
 * ssh2 gives that layer the client's address, not its socket, hence the key.
 */
export class ConnectionDeadlines {
  private readonly pending = new Map<string, NodeJS.Timeout>();

  /** False if the address is already pending: the caller should drop the newcomer. */
  register(socket: Socket, deadline: NodeJS.Timeout): boolean {
    const address = addressKey(socket.remoteAddress, socket.remotePort);
    if (this.pending.has(address)) return false;
    this.pending.set(address, deadline);
    socket.once('close', () => {
      if (this.pending.get(address) === deadline) this.pending.delete(address);
    });
    return true;
  }

  claim(ip: string, port: number): NodeJS.Timeout | undefined {
    const address = addressKey(ip, port);
    const deadline = this.pending.get(address);
    this.pending.delete(address);
    return deadline;
  }
}

function addressKey(ip: string | undefined, port: number | undefined): string {
  return `${ip}:${port}`;
}
