import type { AddressInfo } from 'node:net';

export interface SshServer {
  /** Resolves with the bound address once the SSH port is listening. */
  listen(port: number, host: string): Promise<AddressInfo>;
  /** True while listening and not shutting down. */
  isReady(): boolean;
  /**
   * Stops accepting connections and ends every open session. Calling it again
   * returns the same promise.
   */
  shutdown(): Promise<void>;
}
