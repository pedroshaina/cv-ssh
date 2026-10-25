// Must stay the first import: it sets colour env vars before chalk loads.
import './terminal/force-color-env.js';
import type { AddressInfo } from 'node:net';
import { loadConfig } from './config/load-config.js';
import { loadContent } from './content/load-content.js';
import { createHttpServer } from './http/create-http-server.js';
import { createLogger } from './logging/create-logger.js';
import { createSshServer } from './ssh/create-ssh-server.js';

// The level is part of the config, so until that loads, log at the default.
let logger = createLogger('info');

/**
 * Why the process died is the log line that matters most, so it goes out as
 * JSON like every other line, where the cluster's log collector expects it.
 */
function exitWithFatal(error: unknown, message: string): never {
  logger.fatal({ err: error }, message);
  process.exit(1);
}

process.on('uncaughtException', (error) => exitWithFatal(error, 'uncaught exception'));
process.on('unhandledRejection', (reason) => exitWithFatal(reason, 'unhandled rejection'));

function orExit<Result>(failure: string, step: () => Result): Result {
  try {
    return step();
  } catch (error) {
    exitWithFatal(error, failure);
  }
}

const config = orExit('invalid configuration', () => loadConfig());
logger = createLogger(config.logLevel);

// Content is read again for every session, so edits show up without a
// restart. Reading it once now stops a wrong CONTENT_DIR here, not at the
// first visitor.
orExit('content cannot be loaded', () => loadContent(config.contentDir));

const sshServer = createSshServer(config, logger);
await sshServer.listening.catch((error: unknown) => exitWithFatal(error, 'SSH port unavailable'));

const httpServer = createHttpServer(sshServer.isReady);
await new Promise<void>((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen(config.httpPort, config.listenHost, () => {
    httpServer.off('error', reject);
    resolve();
  });
}).catch((error: unknown) => exitWithFatal(error, 'health port unavailable'));
logger.info({ port: (httpServer.address() as AddressInfo).port }, 'health endpoints listening');

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
