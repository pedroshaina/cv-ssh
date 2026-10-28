// The real entry point in a child process: how the server dies at startup.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/** How `pnpm dev` starts the server, minus the file watching. */
const MAIN_ARGUMENTS = ['--import', 'tsx', '--import', './src/terminal/force-color-env.ts', 'src/main.ts'];

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cv-ssh-test-'));
}

/** Settings for a server that would start fine, on free ports. */
function workingEnv(): Record<string, string> {
  const contentDir = tempDir();
  writeFileSync(join(contentDir, '01-about.md'), '# About\n\nHello from the test.\n');
  return {
    HOST: '127.0.0.1',
    PORT: '0',
    HEALTH_PORT: '0',
    HOST_KEY_PATH: join(tempDir(), 'host_key'),
    CONTENT_DIR: contentDir,
  };
}

interface Exit {
  /** undefined if the server was still running after the wait and had to be killed. */
  exitCode: number | undefined;
  /** The log lines on stdout that are JSON. */
  logLines: Array<Record<string, unknown>>;
}

function runMain(env: Record<string, string>): Promise<Exit> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, MAIN_ARGUMENTS, {
      env: { PATH: process.env.PATH, ...env },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (data: Buffer) => (stdout += data.toString('utf8')));
    let wasKilled = false;
    const killTimer = setTimeout(() => {
      wasKilled = true;
      child.kill('SIGKILL');
    }, 3000);
    child.on('exit', (code) => {
      clearTimeout(killTimer);
      const logLines = stdout
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      resolve({ exitCode: wasKilled ? undefined : (code ?? undefined), logLines });
    });
  });
}

const PINO_FATAL = 60;

/** Asserts the process exited with 1 after logging, as JSON, a fatal line that mentions `reason`. */
function assertDiedLogging(exit: Exit, reason: RegExp): void {
  assert.equal(exit.exitCode, 1);
  const fatalLine = exit.logLines.find((logLine) => logLine.level === PINO_FATAL);
  assert.ok(fatalLine, 'no fatal log line');
  assert.match(JSON.stringify(fatalLine), reason);
}

async function occupiedPort(): Promise<{ port: number; blocker: Server }> {
  const blocker = createServer();
  await new Promise<void>((resolveListen) => blocker.listen(0, '127.0.0.1', resolveListen));
  return { port: (blocker.address() as AddressInfo).port, blocker };
}

test('a busy SSH port stops the server with a fatal log line', { timeout: 10_000 }, async () => {
  const { port, blocker } = await occupiedPort();
  try {
    assertDiedLogging(await runMain({ ...workingEnv(), PORT: String(port) }), /EADDRINUSE/);
  } finally {
    blocker.close();
  }
});

test('a busy health port stops the server with a fatal log line', { timeout: 10_000 }, async () => {
  const { port, blocker } = await occupiedPort();
  try {
    assertDiedLogging(await runMain({ ...workingEnv(), HEALTH_PORT: String(port) }), /EADDRINUSE/);
  } finally {
    blocker.close();
  }
});

test('a missing content directory stops the server at startup', { timeout: 10_000 }, async () => {
  const exit = await runMain({ ...workingEnv(), CONTENT_DIR: join(tempDir(), 'missing') });
  assertDiedLogging(exit, /missing/);
});

test('invalid configuration is logged as a fatal line naming the variable', { timeout: 10_000 }, async () => {
  assertDiedLogging(await runMain({ ...workingEnv(), PORT: '70000' }), /PORT/);
});

test('a working server starts, then exits cleanly on SIGTERM', { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, MAIN_ARGUMENTS, {
    env: { PATH: process.env.PATH, ...workingEnv() },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let stdout = '';
  await new Promise<void>((resolveStarted) =>
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
      if (stdout.includes('health endpoints listening')) resolveStarted();
    }),
  );
  child.kill('SIGTERM');
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0);
});
