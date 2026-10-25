import type { AddressInfo, Server } from 'node:net';

/** Resolves with the bound address, or rejects if the port can't be had (e.g. EADDRINUSE). */
export function listen(server: Server, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address() as AddressInfo);
    });
  });
}
