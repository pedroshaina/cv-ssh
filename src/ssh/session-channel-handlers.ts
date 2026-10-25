import type { Session } from 'ssh2';
import type { Config } from '../config/config.schema.js';
import type { CvSession } from '../cv-session/cv-session.types.js';
import { startCvSession } from '../cv-session/start-cv-session.js';
import type { Logger } from '../logging/create-logger.js';
import type { WindowSize } from '../terminal/window-size.types.js';
import { refuseChannel } from './refuse-channel.js';
import { REJECTION_MESSAGES } from './rejection-messages.js';
import type { SessionLimiter } from './session-limits/session-limiter.js';

export interface SessionChannelContext {
  config: Config;
  connectionLogger: Logger;
  clientIp: string;
  sessionLimiter: SessionLimiter;
  /** Every CV session currently open, so shutdown can say goodbye to each. */
  activeSessions: Set<CvSession>;
  isShuttingDown: () => boolean;
  /** Called each time a shell starts, so the connection is no longer on a deadline. */
  onSessionStarted: () => void;
}

/** Offers the CV on a shell with a PTY, and refuses everything else a session can ask for. */
export function handleSessionChannel(session: Session, context: SessionChannelContext): void {
  const { config, connectionLogger, clientIp, sessionLimiter, activeSessions } = context;
  let windowSize: WindowSize | undefined;
  let terminalType: string | undefined;
  let cvSession: CvSession | undefined;

  session.on('pty', (accept, _reject, ptyInfo) => {
    windowSize = { cols: ptyInfo.cols, rows: ptyInfo.rows };
    terminalType = ptyInfo.term;
    accept?.();
  });

  session.on('window-change', (accept, _reject, windowChange) => {
    windowSize = { cols: windowChange.cols, rows: windowChange.rows };
    cvSession?.resize(windowSize);
    accept?.();
  });

  session.on('shell', (accept) => {
    const channel = accept();
    if (!windowSize) {
      refuseChannel(channel, REJECTION_MESSAGES['no-terminal']);
      return;
    }
    if (context.isShuttingDown()) {
      refuseChannel(channel, REJECTION_MESSAGES['shutting-down']);
      return;
    }
    const admission = sessionLimiter.tryAcquire(clientIp);
    if (!admission.ok) {
      connectionLogger.warn(
        { reason: admission.reason, active: sessionLimiter.activeSessionCount },
        'session refused',
      );
      refuseChannel(channel, REJECTION_MESSAGES[admission.reason]);
      return;
    }
    let startedSession: CvSession;
    try {
      startedSession = startCvSession(channel, windowSize, {
        contentDir: config.contentDir,
        idleTimeoutMs: config.idleTimeoutMs,
        logger: connectionLogger,
        onEnd: admission.release,
      });
    } catch (error) {
      // ssh2 would swallow this as a client error, and the slot would never
      // be released.
      admission.release();
      connectionLogger.error({ err: error }, 'session failed to start');
      refuseChannel(channel, REJECTION_MESSAGES['unavailable']);
      return;
    }
    connectionLogger.info(
      { term: terminalType, ...windowSize, active: sessionLimiter.activeSessionCount },
      'session started',
    );
    context.onSessionStarted();
    activeSessions.add(startedSession);
    void startedSession.done.finally(() => activeSessions.delete(startedSession));
    cvSession = startedSession;
  });

  session.on('exec', (accept, _reject, execInfo) => {
    connectionLogger.info({ command: execInfo.command }, 'exec refused');
    refuseChannel(accept(), REJECTION_MESSAGES['commands-unsupported']);
  });

  // Nothing but the shell is offered. sftp and other subsystems are worth
  // a log line; agent and X11 forwarding are client settings some
  // visitors have on everywhere, and env (LANG etc.) is sent by default.
  session.on('sftp', (_accept, reject) => {
    connectionLogger.info({ subsystem: 'sftp' }, 'subsystem refused');
    reject?.();
  });
  session.on('subsystem', (_accept, reject, { name: subsystemName }) => {
    connectionLogger.info({ subsystem: subsystemName }, 'subsystem refused');
    reject?.();
  });
  session.on('auth-agent', (_accept, reject) => reject?.());
  session.on('x11', (_accept, reject) => reject?.());
  session.on('env', (_accept, reject) => reject?.());
  session.on('signal', (_accept, reject) => reject?.());
}
