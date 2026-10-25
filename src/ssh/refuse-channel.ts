import type { ServerChannel } from 'ssh2';

/** Tells the visitor why, then closes the channel with a failing exit status. */
export function refuseChannel(channel: ServerChannel, message: string): void {
  channel.write(`${message}\r\n`);
  channel.exit(1);
  channel.end();
}
