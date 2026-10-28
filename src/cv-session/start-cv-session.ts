import type { ServerChannel } from 'ssh2';
import { loadContent } from '../content/load-content.js';
import { createTerminal } from '../terminal/create-terminal.js';
import type { WindowSize } from '../terminal/window-size.types.js';
import { mountApp } from '../ui/mount-app.js';
import type { CvSession, CvSessionOptions, EndReason } from './cv-session.types.js';
import { GOODBYE_MESSAGES } from './goodbye-messages.constants.js';

export function startCvSession(channel: ServerChannel, windowSize: WindowSize, options: CvSessionOptions): CvSession {
  const { logger } = options;
  // Per connection, so edits need no restart; first, so a throw leaves the channel untouched.
  const content = loadContent(options.contentDir);
  const terminal = createTerminal(channel, windowSize);
  const startedAt = Date.now();
  const sectionsViewed = new Set<string>();
  let endReason: EndReason = 'quit';

  const inkInstance = mountApp(terminal, {
    content,
    onSectionView: (title) => sectionsViewed.add(title),
  });

  let idleTimer: NodeJS.Timeout | undefined;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      endReason = 'idle';
      inkInstance.unmount();
    }, options.idleTimeoutMs);
  };
  // Not terminal.stdin: a 'data' listener there would starve Ink's read() loop.
  channel.on('data', resetIdleTimer);
  resetIdleTimer();

  let isChannelClosed = false;
  channel.on('close', () => {
    isChannelClosed = true;
    endReason = 'disconnect';
    inkInstance.unmount();
  });

  const done = inkInstance
    .waitUntilExit()
    .catch((error: unknown) => {
      endReason = 'error';
      logger.error({ err: error }, 'session crashed');
    })
    .then(() => {
      clearTimeout(idleTimer);
      logger.info(
        { reason: endReason, durationMs: Date.now() - startedAt, sectionsViewed: [...sectionsViewed] },
        'session ended',
      );
      options.onEnd();
      if (isChannelClosed) return;
      // Same stream as Ink, so it lands after the alternate screen is restored.
      return new Promise<void>((resolve) => {
        terminal.stdout.end(GOODBYE_MESSAGES[endReason] ?? '', () => {
          channel.exit(endReason === 'error' ? 1 : 0);
          channel.end();
          resolve();
        });
      });
    });

  return {
    resize: (nextWindowSize) => terminal.stdout.resize(nextWindowSize),
    end: (requestedEndReason) => {
      endReason = requestedEndReason;
      inkInstance.unmount();
    },
    done,
  };
}
