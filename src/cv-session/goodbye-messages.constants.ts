import type { EndReason } from './cv-session.types.js';

export const RESTART_MESSAGE = 'The server is restarting for an update. Please reconnect in a moment.';

export const GOODBYE_MESSAGES: Partial<Record<EndReason, string>> = {
  quit: 'Thanks for stopping by!\n',
  idle: 'Disconnected after a few minutes of inactivity. Thanks for stopping by!\n',
  shutdown: `${RESTART_MESSAGE}\n`,
};
