import type { Logger } from '../logging/create-logger.js';
import type { WindowSize } from '../terminal/window-size.types.js';

export interface CvSessionOptions {
  contentDir: string;
  idleTimeoutMs: number;
  logger: Logger;
  /** Called once, however the session ends. */
  onEnd: () => void;
}

export interface CvSession {
  resize(windowSize: WindowSize): void;
  /** Ends the session from the server side, e.g. on shutdown. */
  end(endReason: 'shutdown'): void;
  /** Resolves once the visitor has been sent off and the channel is closed. */
  done: Promise<void>;
}

export type EndReason = 'quit' | 'idle' | 'disconnect' | 'error' | 'shutdown';
