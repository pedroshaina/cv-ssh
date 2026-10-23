import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import ssh2, { type ServerChannel } from 'ssh2';
import type { Config } from './config.js';
import { SessionLimiter } from './limits.js';
import { log } from './log.js';
import { startCvSession, type CvSession } from './session.js';
import type { WindowSize } from './terminal.js';

const { Server, utils } = ssh2;

/**
 * The host key is the server's identity. If it changes, returning visitors get
 * a "REMOTE HOST IDENTIFICATION HAS CHANGED" warning, so it must persist.
 */
function loadOrCreateHostKey(path: string): Buffer {
  if (!existsSync(path)) {
    const { private: privateKey } = utils.generateKeyPairSync('ed25519');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, privateKey, { mode: 0o600 });
    log.warn({ path }, 'generated new host key');
  }
  return readFileSync(path);
}

const REJECTION_MESSAGES = {
  'server-full': 'Too many visitors right now. Please try again in a minute.',
  'ip-limit': 'You already have the maximum number of sessions open from this address.',
  'shutting-down': 'The server is restarting for an update. Please reconnect in a moment.',
};

function refuse(channel: ServerChannel, message: string): void {
  channel.write(`${message}\r\n`);
  channel.exit(1);
  channel.end();
}

/** How long open sessions get to receive their goodbye before the process exits. */
const SHUTDOWN_GRACE_MS = 5000;

export interface CvServer {
  /** Resolves with the bound address once the SSH port is listening. */
  listening: Promise<AddressInfo>;
  /** True while listening and not shutting down. */
  isReady(): boolean;
  /** Stops accepting connections and ends every open session. */
  shutdown(): Promise<void>;
}

export function startServer(config: Config): CvServer {
  const hostKey = loadOrCreateHostKey(config.hostKeyPath);
  const limiter = new SessionLimiter(config.maxSessions, config.maxSessionsPerIp);
  const sessions = new Set<CvSession>();
  let isListening = false;
  let shuttingDown = false;

  const server = new Server({ hostKeys: [hostKey] }, (client, info) => {
    const connLog = log.child({ conn: randomBytes(4).toString('hex'), ip: info.ip });
    connLog.debug({ client: info.header.versions.software }, 'connection opened');

    // Drop clients that connect but never finish authenticating.
    const handshakeTimer = setTimeout(() => {
      connLog.info('handshake timed out');
      client.end();
    }, config.handshakeTimeoutMs);

    // A public CV: let everyone in, whatever auth method their client tries first.
    client.on('authentication', (ctx) => ctx.accept());

    client.on('ready', () => {
      clearTimeout(handshakeTimer);

      client.on('session', (acceptSession) => {
        const session = acceptSession();
        let size: WindowSize | undefined;
        let term: string | undefined;
        let cv: CvSession | undefined;

        session.on('pty', (accept, _reject, pty) => {
          size = { cols: pty.cols, rows: pty.rows };
          term = pty.term;
          accept?.();
        });

        session.on('window-change', (accept, _reject, change) => {
          size = { cols: change.cols, rows: change.rows };
          cv?.resize(size);
          accept?.();
        });

        session.on('shell', (accept) => {
          const channel = accept();
          if (!size) {
            refuse(channel, 'This CV is interactive and needs a terminal. Try: ssh -t <host>');
            return;
          }
          if (shuttingDown) {
            refuse(channel, REJECTION_MESSAGES['shutting-down']);
            return;
          }
          const admission = limiter.tryAcquire(info.ip);
          if (!admission.ok) {
            connLog.warn({ reason: admission.reason, active: limiter.active }, 'session refused');
            refuse(channel, REJECTION_MESSAGES[admission.reason]);
            return;
          }
          connLog.info({ term, ...size, active: limiter.active }, 'session started');
          const started = startCvSession(channel, size, {
            contentDir: config.contentDir,
            idleTimeoutMs: config.idleTimeoutMs,
            log: connLog,
            onEnd: admission.release,
          });
          sessions.add(started);
          void started.done.finally(() => sessions.delete(started));
          cv = started;
        });

        session.on('exec', (accept, _reject, exec) => {
          connLog.info({ command: exec.command }, 'exec refused');
          refuse(accept(), 'Commands are not supported here. Connect with plain ssh to browse the CV.');
        });
      });
    });

    client.on('error', (error) => connLog.debug({ err: error.message }, 'client error'));
    client.on('close', () => {
      clearTimeout(handshakeTimer);
      connLog.debug('connection closed');
    });
  });

  // Hard cap on raw TCP connections, above the session limit so that polite
  // "server full" messages can still be delivered. Not in @types/ssh2.
  (server as unknown as { maxConnections: number }).maxConnections = config.maxSessions * 2;

  // ssh2 only calls the connection handler above once the client has sent its
  // version line, so a socket that stays silent would hold a connection slot
  // forever. Own the TCP listener and drop sockets that never speak.
  const tcp = createServer((socket) => {
    const silenceTimer = setTimeout(() => socket.destroy(), config.handshakeTimeoutMs);
    socket.once('data', () => clearTimeout(silenceTimer));
    socket.once('close', () => clearTimeout(silenceTimer));
    server.injectSocket(socket);
  });

  const listening = new Promise<AddressInfo>((resolve, reject) => {
    tcp.once('error', reject);
    tcp.listen(config.port, config.host, () => {
      const address = tcp.address() as AddressInfo;
      isListening = true;
      log.info({ host: address.address, port: address.port }, 'cv-ssh listening');
      resolve(address);
    });
  });

  return {
    listening,
    isReady: () => isListening && !shuttingDown,
    async shutdown() {
      shuttingDown = true;
      log.info({ sessions: sessions.size }, 'shutting down');
      // close() stops accepting and calls back once every existing connection
      // has closed, i.e. once visitors have received their goodbye and their
      // ssh client has hung up. Exiting earlier would cut that message off.
      const drained = new Promise<void>((resolve) => tcp.close(() => resolve()));
      for (const session of sessions) session.end('shutdown');
      let graceTimer: NodeJS.Timeout | undefined;
      const grace = new Promise<void>((resolve) => (graceTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS)));
      await Promise.race([drained, grace]);
      clearTimeout(graceTimer);
    },
  };
}
