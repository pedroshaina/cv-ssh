import { pino } from 'pino';
import type { LogLevel } from '../config/config.schema.js';

export type Logger = pino.Logger;

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export function createLogger(level: LogLevel): Logger {
  return pino({ level });
}
