import { pino } from 'pino';

// JSON lines on stdout for the cluster's log collector; `pnpm dev` pipes
// through pino-pretty for humans.
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export type Logger = typeof log;
