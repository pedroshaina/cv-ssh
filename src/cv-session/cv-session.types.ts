import type { Logger } from '../logging/create-logger.js';
import type { WindowSize } from '../terminal/window-size.types.js';

export interface CvSessionOptions {
  contentDir: string;
  idleTimeoutMs: number;
  logger: Logger;
  onEnd: () => void;
}

export interface CvSession {
  resize(windowSize: WindowSize): void;
  end(endReason: EndReason): void;
  done: Promise<void>;
}

export type EndReason = 'quit' | 'idle' | 'disconnect' | 'error' | 'shutdown';
