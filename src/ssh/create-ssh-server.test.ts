import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect as tcpConnect, createServer, type AddressInfo, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import ssh2, { type Client, type ClientChannel } from 'ssh2';
import type { Config } from '../config/config.schema.js';
import { loadConfig } from '../config/load-config.js';
import { createLogger } from '../logging/create-logger.js';
import { createSshServer, type SshServer } from './create-ssh-server.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cv-ssh-test-'));
}

async function start(overrides: Partial<Config> = {}): Promise<{ server: SshServer; port: number }> {
  const contentDir = tempDir();
  writeFileSync(join(contentDir, '_header.md'), '# Ada Lovelace\n\nAnalyst\n');
  writeFileSync(join(contentDir, '01-about.md'), '# About\n\nHello from the test.\n');
  writeFileSync(join(contentDir, '02-contact.md'), '# Contact\n\nReach me by pigeon.\n');
  const server = createSshServer(
    {
      ...loadConfig({}),
      hostKeyPath: join(tempDir(), 'host_key'),
      contentDir,
      ...overrides,
    },
    createLogger('silent'),
  );
  return { server, port: (await server.listen(0, '127.0.0.1')).port };
}

interface Visit {
  channel: ClientChannel;
  output: () => string;
  rawOutput: () => string;
  waitFor: (text: string) => Promise<void>;
  exitCode: Promise<number | undefined>;
  disconnect: () => void;
}

interface VisitOptions {
  command?: string;
  proxyHeader?: string;
  /** false opens the shell without a PTY. */
  window?: { cols: number; rows: number } | false;
}

function relayed(port: number, proxyHeader: string): Socket {
  const socket = tcpConnect(port, '127.0.0.1');
  socket.write(proxyHeader);
  return socket;
}

function visit(port: number, { command, proxyHeader, window }: VisitOptions = {}): Promise<Visit> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    client.on('error', reject);
    client.on('ready', () => {
      const onChannel = (error: Error | undefined, channel: ClientChannel) => {
        if (error) return reject(error);
        let receivedText = '';
        const waiters: Array<() => void> = [];
        channel.on('data', (data: Buffer) => {
          receivedText += data.toString('utf8');
          for (const check of waiters) check();
        });
        const exitCode = new Promise<number | undefined>((resolveExit) => {
          let code: number | undefined;
          channel.on('exit', (exitStatus: number) => (code = exitStatus));
          channel.on('close', () => {
            client.end();
            resolveExit(code);
          });
        });
        const output = () => stripVTControlCharacters(receivedText);
        // Rejects once the channel closes without it, so a refusal fails the test instead of hanging it.
        const waitFor = (text: string) =>
          new Promise<void>((resolveWait, rejectWait) => {
            const check = () => output().includes(text) && resolveWait();
            waiters.push(check);
            check();
            void exitCode.then(() => rejectWait(new Error(`closed before showing "${text}":\n${output()}`)));
          });
        resolve({ channel, output, rawOutput: () => receivedText, waitFor, exitCode, disconnect: () => client.end() });
      };
      if (command) client.exec(command, onChannel);
      else if (window === false) client.shell(false, onChannel);
      else client.shell({ term: 'xterm-256color', cols: 100, rows: 30, ...window }, onChannel);
    });
    const relaySocket = proxyHeader === undefined ? undefined : relayed(port, proxyHeader);
    client.connect({ host: '127.0.0.1', port, username: 'visitor', sock: relaySocket });
  });
}

test('a visitor browses the CV with the keyboard and quits', { timeout: 5000 }, async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    assert.match(session.output(), /Contact/);
    assert.doesNotMatch(session.output(), /Reach me by pigeon/);

    session.channel.write('\x1b[C'); // right arrow
    await session.waitFor('Reach me by pigeon.');

    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
    assert.match(session.output(), /Thanks for stopping by!/);
  } finally {
    await server.shutdown();
  }
});

test('visitors get colour, even though the server has no TTY', async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    // oxlint-disable-next-line no-control-regex
    assert.match(session.rawOutput(), /\x1b\[(3\d|38;5;\d+)m/);
    session.channel.write('q');
    await session.exitCode;
  } finally {
    await server.shutdown();
  }
});

test('an idle visitor is disconnected with a goodbye', { timeout: 5000 }, async () => {
  const { server, port } = await start({ idleTimeoutMs: 300 });
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    assert.equal(await session.exitCode, 0);
    assert.match(session.output(), /Disconnected after a few minutes of inactivity/);
  } finally {
    await server.shutdown();
  }
});

test('typing keeps a visitor from being disconnected as idle', { timeout: 5000 }, async () => {
  const { server, port } = await start({ idleTimeoutMs: 400 });
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    for (let keypress = 0; keypress < 6; keypress++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
      session.channel.write('j');
    }
    assert.doesNotMatch(session.output(), /Disconnected after a few minutes of inactivity/);
    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
  } finally {
    await server.shutdown();
  }
});

function closed(socket: Socket): Promise<void> {
  return new Promise((resolveClose) => {
    socket.on('error', () => {});
    socket.once('close', () => resolveClose());
    // A paused socket never reports its close.
    socket.resume();
  });
}

test('a client that sends one byte and stalls is dropped', { timeout: 5000 }, async () => {
  const { server, port } = await start({ handshakeTimeoutMs: 300 });
  try {
    const stalled = tcpConnect(port, '127.0.0.1');
    stalled.write('S');
    await closed(stalled);
  } finally {
    await server.shutdown();
  }
});

test('a client that authenticates but never opens a shell is dropped', { timeout: 5000 }, async () => {
  const { server, port } = await start({ handshakeTimeoutMs: 300 });
  try {
    const client = await connect(port);
    await new Promise<void>((resolveClose) => client.once('close', () => resolveClose()));
  } finally {
    await server.shutdown();
  }
});

test('a visitor is not cut off once their shell has started', { timeout: 5000 }, async () => {
  // Long enough for a slow CI runner to finish the handshake.
  const { server, port } = await start({ handshakeTimeoutMs: 1500 });
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
  } finally {
    await server.shutdown();
  }
});

test('when the CV cannot be loaded, visitors are told and no session slot is lost', { timeout: 5000 }, async () => {
  const { server, port } = await start({ contentDir: join(tempDir(), 'missing'), maxSessions: 1 });
  try {
    for (const attempt of [1, 2]) {
      const session = await visit(port);
      assert.equal(await session.exitCode, 1, `attempt ${attempt}`);
      assert.match(session.output(), /Something went wrong on our side/);
    }
  } finally {
    await server.shutdown();
  }
});

test('Ctrl-C and Esc quit too', { timeout: 5000 }, async () => {
  const { server, port } = await start();
  try {
    for (const key of ['\x03', '\x1b']) {
      const session = await visit(port);
      await session.waitFor('Hello from the test.');
      session.channel.write(key);
      assert.equal(await session.exitCode, 0, JSON.stringify(key));
    }
  } finally {
    await server.shutdown();
  }
});

test('a terminal too small for the CV says so', { timeout: 5000 }, async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port, { window: { cols: 30, rows: 10 } });
    await session.waitFor('Too small: 30×10');
    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
  } finally {
    await server.shutdown();
  }
});

test('a shell without a terminal is told it needs one', async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port, { window: false });
    assert.equal(await session.exitCode, 1);
    assert.match(session.output(), /needs a terminal/);
  } finally {
    await server.shutdown();
  }
});

test('a visitor who quits or disconnects frees their session slot', { timeout: 5000 }, async () => {
  const { server, port } = await start({ maxSessions: 1 });
  try {
    const quitter = await visit(port);
    await quitter.waitFor('Hello from the test.');
    quitter.channel.write('q');
    await quitter.exitCode;

    const dropper = await visit(port);
    await dropper.waitFor('Hello from the test.');
    dropper.disconnect();

    const next = await visit(port);
    await next.waitFor('Hello from the test.');
    next.channel.write('q');
    assert.equal(await next.exitCode, 0);
  } finally {
    await server.shutdown();
  }
});

test('a full server tells the next visitor to come back later', { timeout: 5000 }, async () => {
  const { server, port } = await start({ maxSessions: 1 });
  try {
    const first = await visit(port);
    await first.waitFor('Hello from the test.');
    const second = await visit(port);
    assert.equal(await second.exitCode, 1);
    assert.match(second.output(), /Too many visitors/);
  } finally {
    await server.shutdown();
  }
});

/** Resolves with the public host key the server presents. */
function hostKeyOf(port: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    client.on('error', reject);
    client.on('ready', () => client.end());
    client.connect({
      host: '127.0.0.1',
      port,
      username: 'visitor',
      hostVerifier: (key: Buffer) => {
        resolve(key);
        return true;
      },
    });
  });
}

test('the host key survives a restart', async () => {
  const hostKeyPath = join(tempDir(), 'host_key');
  const first = await start({ hostKeyPath });
  const firstKey = await hostKeyOf(first.port);
  await first.server.shutdown();

  const second = await start({ hostKeyPath });
  try {
    assert.deepEqual(await hostKeyOf(second.port), firstKey);
  } finally {
    await second.server.shutdown();
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

test('shutdown sends open sessions off politely, however often it is called', async () => {
  const { server, port } = await start();
  const session = await visit(port);
  await session.waitFor('Hello from the test.');
  assert.equal(server.isReady(), true);

  const shutdowns = [server.shutdown(), server.shutdown()];
  assert.equal(server.isReady(), false);
  assert.equal(await session.exitCode, 0);
  assert.match(session.output(), /The server is restarting/);
  await Promise.all(shutdowns);
});

function connect(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    client.on('error', reject);
    client.on('ready', () => resolve(client));
    client.connect({ host: '127.0.0.1', port, username: 'visitor' });
  });
}

function refusal(call: (callback: (error?: Error) => void) => void): Promise<Error> {
  return new Promise((resolve, reject) =>
    call((error) => (error ? resolve(error) : reject(new Error('the server allowed it')))),
  );
}

test('port forwarding is refused, so the server is no proxy', async () => {
  let reached = false;
  const target = createServer((socket) => {
    reached = true;
    socket.destroy();
  });
  await new Promise<void>((resolveListen) => target.listen(0, '127.0.0.1', resolveListen));
  const targetPort = (target.address() as AddressInfo).port;

  const { server, port } = await start();
  const client = await connect(port);
  try {
    // ssh -L / -D / -W
    await refusal((callback) => client.forwardOut('127.0.0.1', 12345, '127.0.0.1', targetPort, callback));
    // ssh -R
    await refusal((callback) => client.forwardIn('127.0.0.1', 0, callback));
    // ssh -L to a Unix socket
    await refusal((callback) => client.openssh_forwardOutStreamLocal('/var/run/docker.sock', callback));
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
    await refusal((callback) => client.sftp(callback));
    await refusal((callback) => client.subsys('netconf', callback));
  } finally {
    client.end();
    await server.shutdown();
  }
});

const fromRelay = (ip: string) => `PROXY TCP4 ${ip} 10.0.0.5 51234 22\r\n`;

test(
  'behind a relay, the per-IP limit applies to the visitor address in the PROXY header',
  { timeout: 5000 },
  async () => {
    const { server, port } = await start({ proxyProtocol: true, maxSessionsPerIp: 1 });
    try {
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
  },
);

test('behind a relay, a connection reset mid-header does not take the server down', { timeout: 5000 }, async () => {
  const { server, port } = await start({ proxyProtocol: true });
  try {
    const abandoned = relayed(port, 'PROXY TCP4 203.0');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    abandoned.resetAndDestroy();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

    const session = await visit(port, { proxyHeader: fromRelay('203.0.113.7') });
    await session.waitFor('Hello from the test.');
    session.channel.write('q');
    assert.equal(await session.exitCode, 0);
  } finally {
    await server.shutdown();
  }
});

test('behind a relay, a second connection claiming a live visitor address is dropped', { timeout: 5000 }, async () => {
  const { server, port } = await start({ proxyProtocol: true });
  try {
    const original = relayed(port, fromRelay('203.0.113.7'));
    let isOriginalClosed = false;
    original.on('error', () => {});
    original.once('close', () => (isOriginalClosed = true));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

    await closed(relayed(port, fromRelay('203.0.113.7')));
    assert.equal(isOriginalClosed, false);
    original.destroy();
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
