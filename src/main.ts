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
const sshAddress = await sshServer
  .listen(config.sshPort, config.listenHost)
  .catch((error: unknown) => exitWithFatal(error, 'SSH port unavailable'));
logger.info({ host: sshAddress.address, port: sshAddress.port }, 'cv-ssh listening');

const httpServer = createHttpServer(sshServer.isReady);
const httpAddress = await httpServer
  .listen(config.httpPort, config.listenHost)
  .catch((error: unknown) => exitWithFatal(error, 'health port unavailable'));
logger.info({ port: httpAddress.port }, 'health endpoints listening');

// Kubernetes sends SIGTERM on rollouts. As PID 1 in the container, Node has no
// default handler for it, so without this the pod would hang until SIGKILL.
//
// Use `on`, not `once`: Ink depends on signal-exit, which re-raises the signal
// to kill the process as soon as it sees no other listeners left, cutting our
// graceful shutdown short.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    // /ready turns 503 as soon as shutdown starts; /health stays up until exit.
    void sshServer.shutdown().finally(() => process.exit(0));
  });
}
