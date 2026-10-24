// Must stay the first import: it sets colour env vars before chalk loads.
import './env.js';
import { loadConfig } from './config/load-config.js';
import { createHealthServer } from './health.js';
import { createLogger } from './logging/create-logger.js';
import { startServer } from './server.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const server = startServer(config, logger);

const health = createHealthServer(server.isReady);
health.listen(config.httpPort, config.listenHost, () => {
  logger.info({ port: config.httpPort }, 'health endpoints listening');
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
