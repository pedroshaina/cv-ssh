// End-to-end: a real SSH client against a real server on a random port.
import './env.js';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import ssh2, { type ClientChannel } from 'ssh2';
import { config } from './config.js';
import { startServer, type CvServer } from './server.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cv-ssh-test-'));
}

async function start(): Promise<{ server: CvServer; port: number }> {
  const contentDir = tempDir();
  writeFileSync(join(contentDir, '_header.md'), '# Ada Lovelace\n\nAnalyst\n');
  writeFileSync(join(contentDir, '01-about.md'), '# About\n\nHello from the test.\n');
  writeFileSync(join(contentDir, '02-contact.md'), '# Contact\n');
  const server = startServer({
    ...config,
    host: '127.0.0.1',
    port: 0,
    hostKeyPath: join(tempDir(), 'host_key'),
    contentDir,
  });
  return { server, port: (await server.listening).port };
}

interface Visit {
  channel: ClientChannel;
  /** Everything received so far, with escape codes stripped. */
  output: () => string;
  waitFor: (text: string) => Promise<void>;
  exitCode: Promise<number | undefined>;
}

/** Connects and opens a shell (with a PTY) or runs a command (without one). */
function visit(port: number, command?: string): Promise<Visit> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    client.on('error', reject);
    client.on('ready', () => {
      const onChannel = (err: Error | undefined, channel: ClientChannel) => {
        if (err) return reject(err);
        let raw = '';
        const waiters: Array<() => void> = [];
        channel.on('data', (data: Buffer) => {
          raw += data.toString('utf8');
          for (const check of waiters) check();
        });
        const exitCode = new Promise<number | undefined>((done) => {
          let code: number | undefined;
          channel.on('exit', (exit: number) => (code = exit));
          channel.on('close', () => {
            client.end();
            done(code);
          });
        });
        const output = () => stripVTControlCharacters(raw);
        const waitFor = (text: string) =>
          new Promise<void>((done) => {
            const check = () => output().includes(text) && done();
            waiters.push(check);
            check();
          });
        resolve({ channel, output, waitFor, exitCode });
      };
      if (command) client.exec(command, onChannel);
      else client.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, onChannel);
    });
    client.connect({ host: '127.0.0.1', port, username: 'visitor' });
  });
}

test('a visitor browses the CV and quits', async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    assert.match(session.output(), /Contact/);

    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
    assert.match(session.output(), /Thanks for stopping by!/);
  } finally {
    await server.shutdown();
  }
});

test('commands are refused', async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port, 'uptime');
    assert.equal(await session.exitCode, 1);
    assert.match(session.output(), /Commands are not supported/);
  } finally {
    await server.shutdown();
  }
});

test('shutdown sends open sessions off politely', async () => {
  const { server, port } = await start();
  const session = await visit(port);
  await session.waitFor('Hello from the test.');
  assert.equal(server.isReady(), true);

  const shutdown = server.shutdown();
  assert.equal(server.isReady(), false);
  assert.equal(await session.exitCode, 0);
  assert.match(session.output(), /The server is restarting/);
  await shutdown;
});
