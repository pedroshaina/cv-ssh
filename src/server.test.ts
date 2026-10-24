// End-to-end: a real SSH client against a real server on a random port.
import './env.js';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect as tcpConnect, createServer, type AddressInfo, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import ssh2, { type Client, type ClientChannel } from 'ssh2';
import type { Config } from './config/config.schema.js';
import { loadConfig } from './config/load-config.js';
import { startServer, type CvServer } from './server.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cv-ssh-test-'));
}

async function start(overrides: Partial<Config> = {}): Promise<{ server: CvServer; port: number }> {
  const contentDir = tempDir();
  writeFileSync(join(contentDir, '_header.md'), '# Ada Lovelace\n\nAnalyst\n');
  writeFileSync(join(contentDir, '01-about.md'), '# About\n\nHello from the test.\n');
  writeFileSync(join(contentDir, '02-contact.md'), '# Contact\n');
  const server = startServer({
    ...loadConfig({}),
    listenHost: '127.0.0.1',
    sshPort: 0,
    hostKeyPath: join(tempDir(), 'host_key'),
    contentDir,
    ...overrides,
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

interface VisitOptions {
  /** Run this instead of opening a shell (with a PTY). */
  command?: string;
  /** Sent before SSH, as a relay would. */
  proxyHeader?: string;
}

/** A TCP connection that starts with `proxyHeader`, as from a relay. */
function relayed(port: number, proxyHeader: string): Socket {
  const socket = tcpConnect(port, '127.0.0.1');
  socket.write(proxyHeader);
  return socket;
}

/** Connects and opens a shell or runs a command. */
function visit(port: number, { command, proxyHeader }: VisitOptions = {}): Promise<Visit> {
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
    const sock = proxyHeader === undefined ? undefined : relayed(port, proxyHeader);
    client.connect({ host: '127.0.0.1', port, username: 'visitor', sock });
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
    const session = await visit(port, { command: 'uptime' });
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

/** Connects and authenticates, without opening any channel. */
function connect(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    client.on('error', reject);
    client.on('ready', () => resolve(client));
    client.connect({ host: '127.0.0.1', port, username: 'visitor' });
  });
}

/** Resolves with the error a client call reports, or fails if it succeeds. */
function refusal(call: (callback: (err?: Error) => void) => void): Promise<Error> {
  return new Promise((resolve, reject) =>
    call((err) => (err ? resolve(err) : reject(new Error('the server allowed it')))),
  );
}

test('port forwarding is refused, so the server is no proxy', async () => {
  // Something reachable from the server, as a LAN host would be.
  let reached = false;
  const target = createServer((socket) => {
    reached = true;
    socket.destroy();
  });
  await new Promise<void>((done) => target.listen(0, '127.0.0.1', done));
  const targetPort = (target.address() as AddressInfo).port;

  const { server, port } = await start();
  const client = await connect(port);
  try {
    // ssh -L / -D / -W
    await refusal((cb) => client.forwardOut('127.0.0.1', 12345, '127.0.0.1', targetPort, cb));
    // ssh -R
    await refusal((cb) => client.forwardIn('127.0.0.1', 0, cb));
    // ssh -L to a Unix socket, e.g. a container runtime's
    await refusal((cb) => client.openssh_forwardOutStreamLocal('/var/run/docker.sock', cb));
    assert.equal(reached, false);
  } finally {
    client.end();
    target.close();
    await server.shutdown();
  }
});

test('sftp and other subsystems are refused', async () => {
  const { server, port } = await start();
  const client = await connect(port);
  try {
    await refusal((cb) => client.sftp(cb));
    await refusal((cb) => client.subsys('netconf', cb));
  } finally {
    client.end();
    await server.shutdown();
  }
});

const fromRelay = (ip: string) => `PROXY TCP4 ${ip} 10.0.0.5 51234 22\r\n`;

test('behind a relay, the per-IP limit applies to the visitor address in the PROXY header', { timeout: 5000 }, async () => {
  const { server, port } = await start({ proxyProtocol: true, maxSessionsPerIp: 1 });
  try {
    // All three come from 127.0.0.1; only the header tells them apart.
    const first = await visit(port, { proxyHeader: fromRelay('203.0.113.7') });
    await first.waitFor('Hello from the test.');
    const other = await visit(port, { proxyHeader: fromRelay('198.51.100.9') });
    await other.waitFor('Hello from the test.');

    const again = await visit(port, { proxyHeader: fromRelay('203.0.113.7') });
    assert.equal(await again.exitCode, 1);
    assert.match(again.output(), /maximum number of sessions/);
  } finally {
    await server.shutdown();
  }
});

test('behind a relay, connections without a PROXY header are dropped', async () => {
  const { server, port } = await start({ proxyProtocol: true });
  try {
    await assert.rejects(visit(port));
    await assert.rejects(visit(port, { proxyHeader: 'PROXY TCP4 forged\r\n' }));
  } finally {
    await server.shutdown();
  }
});
