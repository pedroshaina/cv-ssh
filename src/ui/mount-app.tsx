import { render, type Instance } from 'ink';
import type { Terminal } from '../terminal/create-terminal.js';
import { App, type AppProps } from './App.js';

export function mountApp(terminal: Terminal, appProps: AppProps): Instance {
  return render(<App {...appProps} />, {
    stdin: terminal.stdin,
    stdout: terminal.stdout,
    stderr: terminal.stdout,
    interactive: true,
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
}
