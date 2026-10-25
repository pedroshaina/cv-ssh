import type { RefusalReason } from './session-limits/admission.types.js';

/** What a visitor reads when the server turns their session down. */
export const REJECTION_MESSAGES: Record<
  RefusalReason | 'shutting-down' | 'no-terminal' | 'commands-unsupported',
  string
> = {
  'server-full': 'Too many visitors right now. Please try again in a minute.',
  'ip-limit': 'You already have the maximum number of sessions open from this address.',
  'shutting-down': 'The server is restarting for an update. Please reconnect in a moment.',
  'no-terminal': 'This CV is interactive and needs a terminal. Try: ssh -t <host>',
  'commands-unsupported': 'Commands are not supported here. Connect with plain ssh to browse the CV.',
};
