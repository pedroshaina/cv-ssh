import type { Config } from './config/config.schema.js';
import { loadConfig } from './config/load-config.js';
import type { CvContent } from './content/content.types.js';
import { loadContent } from './content/load-content.js';
import { createHttpServer } from './http/create-http-server.js';
import { createLogger, DEFAULT_LOG_LEVEL } from './logging/create-logger.js';
import { createSshServer } from './ssh/create-ssh-server.js';

let logger = createLogger(DEFAULT_LOG_LEVEL);

process.on('uncaughtException', (error) => logAndExit(error, 'uncaught exception'));
process.on('unhandledRejection', (reason) => logAndExit(reason, 'unhandled rejection'));

const config = loadConfigOrExit();
logger = createLogger(config.logLevel);

// Fail early on unparseable content
loadContentOrExit(config.contentDir);

const sshServer = createSshServer(config, logger);
const sshAddress = await sshServer
  .listen(config.sshPort, config.listenHost)
  .catch((error: unknown) => logAndExit(error, 'SSH port unavailable'));
logger.info({ host: sshAddress.address, port: sshAddress.port }, 'cv-ssh listening');

const httpServer = createHttpServer(sshServer.isReady);
const httpAddress = await httpServer
  .listen(config.httpPort, config.listenHost)
  .catch((error: unknown) => logAndExit(error, 'health port unavailable'));
logger.info({ port: httpAddress.port }, 'health endpoints listening');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    // /ready turns 503 as soon as shutdown starts; /health stays up until exit.
    void sshServer.shutdown().finally(() => process.exit(0));
  });
}

function logAndExit(error: unknown, message: string): never {
  logger.fatal({ err: error }, message);
  process.exit(1);
}

function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error: unknown) {
    logAndExit(error, 'Could not load config');
  }
}

function loadContentOrExit(contentDir: string): CvContent {
  try {
    return loadContent(contentDir);
  } catch (error: unknown) {
    logAndExit(error, 'Could not load content');
  }
}
