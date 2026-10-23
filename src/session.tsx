import { render } from 'ink';
import type { ServerChannel } from 'ssh2';
import { loadContent } from './content.js';
import type { Logger } from './log.js';
import { createTerminal, type WindowSize } from './terminal.js';
import { App } from './ui/App.js';

export interface CvSessionOptions {
  contentDir: string;
  idleTimeoutMs: number;
  log: Logger;
  /** Called once, however the session ends. */
  onEnd: () => void;
}

export interface CvSession {
  resize(size: WindowSize): void;
  /** Ends the session from the server side, e.g. on shutdown. */
  end(reason: 'shutdown'): void;
  /** Resolves once the visitor has been sent off and the channel is closed. */
  done: Promise<void>;
}

type EndReason = 'quit' | 'idle' | 'disconnect' | 'error' | 'shutdown';

const GOODBYE: Partial<Record<EndReason, string>> = {
  quit: 'Thanks for stopping by!\n',
  idle: 'Disconnected after a few minutes of inactivity. Thanks for stopping by!\n',
  shutdown: 'The server is restarting for an update. Please reconnect in a moment.\n',
};

/** Mounts the CV app on one SSH shell channel; closes the channel when the app exits. */
export function startCvSession(channel: ServerChannel, size: WindowSize, options: CvSessionOptions): CvSession {
  const { log } = options;
  const terminal = createTerminal(channel, size);
  const startedAt = Date.now();
  const sectionsViewed = new Set<string>();
  let reason: EndReason = 'quit';

  // Read per connection so content edits show up without a restart.
  const instance = render(
    <App content={loadContent(options.contentDir)} onSectionView={(title) => sectionsViewed.add(title)} />,
    {
      stdin: terminal.stdin,
      stdout: terminal.stdout,
      stderr: terminal.stdout,
      interactive: true,
      alternateScreen: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );

  let idleTimer: NodeJS.Timeout | undefined;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      reason = 'idle';
      instance.unmount();
    }, options.idleTimeoutMs);
  };
  // Listen on the channel, not terminal.stdin: a 'data' listener would put
  // that stream in flowing mode and starve Ink's read() loop.
  channel.on('data', resetIdleTimer);
  resetIdleTimer();

  let closed = false;
  channel.on('close', () => {
    closed = true;
    reason = 'disconnect';
    instance.unmount();
  });

  const done = instance
    .waitUntilExit()
    .catch((error: unknown) => {
      reason = 'error';
      log.error({ err: error }, 'session crashed');
    })
    .then(() => {
      clearTimeout(idleTimer);
      log.info(
        { reason, durationMs: Date.now() - startedAt, sectionsViewed: [...sectionsViewed] },
        'session ended',
      );
      options.onEnd();
      if (closed) return;
      // Through the same stream as Ink's output, so it lands after the
      // alternate screen has been restored.
      return new Promise<void>((resolve) => {
        terminal.stdout.end(GOODBYE[reason] ?? '', () => {
          channel.exit(reason === 'error' ? 1 : 0);
          channel.end();
          resolve();
        });
      });
    });

  return {
    resize: (next) => terminal.stdout.resize(next),
    end: (endReason) => {
      reason = endReason;
      instance.unmount();
    },
    done,
  };
}
