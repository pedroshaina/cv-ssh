// Must stay the first import: it sets colour env vars before chalk loads.
import './terminal/force-color-env.js';
import { ConfigError, loadConfig } from './config/load-config.js';
import { createHttpServer } from './http/create-http-server.js';
import { createLogger } from './logging/create-logger.js';
import { createSshServer } from './ssh/create-ssh-server.js';

function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (error) {
    // No logger yet: its level is part of the config that just failed.
    if (error instanceof ConfigError) {
      console.error(`Invalid configuration:\n${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const logger = createLogger(config.logLevel);
const sshServer = createSshServer(config, logger);

const httpServer = createHttpServer(sshServer.isReady);
httpServer.listen(config.httpPort, config.listenHost, () => {
  logger.info({ port: config.httpPort }, 'health endpoints listening');
});

// Kubernetes sends SIGTERM on rollouts. As PID 1 in the container, Node has no
// default handler for it, so without this the pod would hang until SIGKILL.
//
// Use `on`, not `once`: Ink depends on signal-exit, which re-raises the signal
// to kill the process as soon as it sees no other listeners left, cutting our
// graceful shutdown short.
let isShuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    // /ready turns 503 as soon as shutdown starts; /health stays up until exit.
    void sshServer.shutdown().finally(() => process.exit(0));
  });
}
