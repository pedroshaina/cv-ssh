import { createServer, type Server } from 'node:http';

/**
 * The cluster's deployment contract: `GET /health` (the process is alive) and
 * `GET /ready` (it can take visitors) on a plain HTTP port, separate from SSH.
 */
export function createHealthServer(isReady: () => boolean): Server {
  return createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
    } else if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    } else if (req.url === '/ready') {
      const ready = isReady();
      res.writeHead(ready ? 200 : 503, { 'content-type': 'text/plain' }).end(ready ? 'ready\n' : 'not ready\n');
    } else {
      res.writeHead(404).end();
    }
  });
}
