import type { AddressInfo } from 'node:net';

export interface SshServer {
  /** Resolves with the bound address once the SSH port is listening. */
  listening: Promise<AddressInfo>;
  /** True while listening and not shutting down. */
  isReady(): boolean;
  /** Stops accepting connections and ends every open session. */
  shutdown(): Promise<void>;
}
