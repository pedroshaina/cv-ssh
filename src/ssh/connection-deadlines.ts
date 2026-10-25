import type { Socket } from 'node:net';

/**
 * Each connection gets one deadline, from TCP accept until its shell starts.
 * The TCP listener starts it, but only the SSH layer knows when a shell
 * starts, and ssh2 hands that layer the client's address rather than its
 * socket. So deadlines wait here, keyed by that address (the PROXY header's,
 * when there is one), until the SSH layer claims its own.
 */
export class ConnectionDeadlines {
  private readonly pending = new Map<string, NodeJS.Timeout>();

  /**
   * Returns false if a connection with the same address is still waiting to
   * be claimed. That only happens behind a relay that reuses addresses, and
   * the caller should drop the newcomer: claiming could not tell them apart.
   */
  register(socket: Socket, deadline: NodeJS.Timeout): boolean {
    const address = addressKey(socket.remoteAddress, socket.remotePort);
    if (this.pending.has(address)) return false;
    this.pending.set(address, deadline);
    socket.once('close', () => {
      if (this.pending.get(address) === deadline) this.pending.delete(address);
    });
    return true;
  }

  /** Hands over the deadline of the connection at this address, for its SSH layer to clear. */
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
