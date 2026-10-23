// Must stay the first import: it sets colour env vars before chalk loads.
import './env.js';
import { config } from './config.js';
import { createHealthServer } from './health.js';
import { log } from './log.js';
import { startServer } from './server.js';

const server = startServer(config);

const health = createHealthServer(server.isReady);
health.listen(config.healthPort, config.host, () => {
  log.info({ port: config.healthPort }, 'health endpoints listening');
});

// Kubernetes sends SIGTERM on rollouts. As PID 1 in the container, Node has no
// default handler for it, so without this the pod would hang until SIGKILL.
//
// Use `on`, not `once`: Ink depends on signal-exit, which re-raises the signal
// to kill the process as soon as it sees no other listeners left, cutting our
// graceful shutdown short.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // /ready turns 503 as soon as shutdown starts; /health stays up until exit.
    void server.shutdown().finally(() => process.exit(0));
  });
}
