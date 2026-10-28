import { pino } from 'pino';
import type { LogLevel } from '../config/config.schema.js';

export type Logger = pino.Logger;

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

// JSON lines on stdout for the cluster's log collector; `pnpm dev` pipes
// through pino-pretty for humans.
export function createLogger(level: LogLevel): Logger {
  return pino({ level });
}
