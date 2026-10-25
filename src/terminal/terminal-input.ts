import { PassThrough } from 'node:stream';

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
