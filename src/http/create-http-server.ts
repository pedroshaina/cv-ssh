import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { listen } from '../net/listen.js';

export interface HttpServer {
  listen(port: number, host: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

/**
 * The cluster's deployment contract: `GET /health` (the process is alive) and
 * `GET /ready` (it can take visitors) on a plain HTTP port, separate from SSH.
 */
export function createHttpServer(isReady: () => boolean): HttpServer {
  const server = createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405).end();
    } else if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    } else if (request.url === '/ready') {
      const ready = isReady();
      response.writeHead(ready ? 200 : 503, { 'content-type': 'text/plain' }).end(ready ? 'ready\n' : 'not ready\n');
    } else {
      response.writeHead(404).end();
    }
  });

  return {
    listen: (port, host) => listen(server, port, host),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
