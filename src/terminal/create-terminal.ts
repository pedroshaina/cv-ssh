import type { ServerChannel } from 'ssh2';
import { TerminalInput } from './terminal-input.js';
import { TerminalOutput } from './terminal-output.js';
import type { WindowSize } from './window-size.types.js';

/** Makes an SSH channel look like a TTY to Ink. */
export interface Terminal {
  stdin: TerminalInput;
  stdout: TerminalOutput;
}

export function createTerminal(channel: ServerChannel, windowSize: WindowSize): Terminal {
  const stdin = new TerminalInput();
  channel.pipe(stdin);
  return { stdin, stdout: new TerminalOutput(channel, windowSize) };
}
