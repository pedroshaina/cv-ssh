import { Writable } from 'node:stream';
import type { ServerChannel } from 'ssh2';
import type { WindowSize } from './window-size.types.js';

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
