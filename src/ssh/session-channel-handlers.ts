import type { Session } from 'ssh2';
import type { CvSession } from '../cv-session/cv-session.types.js';
import { startCvSession } from '../cv-session/start-cv-session.js';
import type { Logger } from '../logging/create-logger.js';
import type { WindowSize } from '../terminal/window-size.types.js';
import { REFUSAL_MESSAGES, refuseChannel } from './refusals.js';
import type { SessionRegistry } from './session-registry.js';

export interface SessionChannelContext {
  connectionLogger: Logger;
  clientIp: string;
  sessionRegistry: SessionRegistry;
  contentDir: string;
  idleTimeoutMs: number;
  onSessionStarted: () => void;
}

export function handleSessionChannel(session: Session, context: SessionChannelContext): void {
  const { connectionLogger, clientIp, sessionRegistry } = context;
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
      refuseChannel(channel, REFUSAL_MESSAGES['no-terminal']);
      return;
    }
    const admission = sessionRegistry.tryAdmit(clientIp);
    if (!admission.ok) {
      connectionLogger.warn(
        { reason: admission.reason, active: sessionRegistry.activeSessionCount },
        'session refused',
      );
      refuseChannel(channel, REFUSAL_MESSAGES[admission.reason]);
      return;
    }
    let startedSession: CvSession;
    try {
      startedSession = startCvSession(channel, windowSize, {
        contentDir: context.contentDir,
        idleTimeoutMs: context.idleTimeoutMs,
        logger: connectionLogger,
        onEnd: admission.slot.release,
      });
    } catch (error) {
      // ssh2 would swallow this as a client error and the slot would leak.
      admission.slot.release();
      connectionLogger.error({ err: error }, 'session failed to start');
      refuseChannel(channel, REFUSAL_MESSAGES['unavailable']);
      return;
    }
    admission.slot.hold(startedSession);
    connectionLogger.info(
      { term: terminalType, ...windowSize, active: sessionRegistry.activeSessionCount },
      'session started',
    );
    context.onSessionStarted();
    cvSession = startedSession;
  });

  session.on('exec', (accept, _reject, execInfo) => {
    connectionLogger.info({ command: execInfo.command }, 'exec refused');
    refuseChannel(accept(), REFUSAL_MESSAGES['commands-unsupported']);
  });

  // Subsystems get a log line; agent, X11 and env are sent by ordinary clients.
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
