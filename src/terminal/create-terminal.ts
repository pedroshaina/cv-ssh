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

/** Ink needs a raw-mode TTY; ssh already put the client's terminal in raw mode. */
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

/** No kernel PTY sits in between, so nothing else translates "\n" to "\r\n". */
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
      // Client gone: drop output rather than erroring mid-unmount.
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
