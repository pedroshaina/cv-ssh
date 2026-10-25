import { PassThrough, Writable } from 'node:stream';
import type { ServerChannel } from 'ssh2';
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

/**
 * Keystrokes from the SSH client. Ink only accepts input streams that look like
 * a TTY with raw mode support. The client's own terminal is already in raw mode
 * (ssh puts it there), so setRawMode has nothing left to do.
 */
export class TerminalInput extends PassThrough {
  readonly isTTY = true;

  setRawMode(_enabled: boolean): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

/**
 * Screen output to the SSH client, plus the window size Ink lays out against.
 *
 * There is no kernel PTY between us and the client, so nothing performs the
 * usual "\n" -> "\r\n" translation; without it every line would start where the
 * previous one ended.
 */
export class TerminalOutput extends Writable {
  readonly isTTY = true;
  columns: number;
  rows: number;

  constructor(
    private readonly channel: ServerChannel,
    windowSize: WindowSize,
  ) {
    super({ decodeStrings: false });
    this.columns = windowSize.cols;
    this.rows = windowSize.rows;
  }

  override _write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.channel.writable) {
      // The client has gone; drop output rather than erroring mid-unmount.
      callback();
      return;
    }
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    this.channel.write(text.replace(/\r?\n/g, '\r\n'), () => callback());
  }

  resize(windowSize: WindowSize): void {
    this.columns = windowSize.cols;
    this.rows = windowSize.rows;
    this.emit('resize');
  }
}
