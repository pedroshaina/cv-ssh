import type { EndReason } from './cv-session.types.js';

/** The last line a visitor sees, by why the session ended. */
export const GOODBYE_MESSAGES: Partial<Record<EndReason, string>> = {
  quit: 'Thanks for stopping by!\n',
  idle: 'Disconnected after a few minutes of inactivity. Thanks for stopping by!\n',
  shutdown: 'The server is restarting for an update. Please reconnect in a moment.\n',
};
