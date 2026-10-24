# Project Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise `src/` into domain folders with small, explicitly named files, and validate config with Zod at startup, without changing behaviour (one deliberate exception: empty env vars fall back to defaults).

**Architecture:** Move and split code; no logic rewrites. Config and the logger stop being module globals: `main.ts` builds both and passes them down. The end-to-end SSH tests are the safety net and keep their assertions throughout.

**Tech Stack:** Node 24, TypeScript 7, ssh2, Ink 8 / React 19, pino, node:test via tsx, Zod 4 (new).

**Spec:** `docs/superpowers/specs/2026-10-24-project-structure-design.md`

## Global Constraints

- Behaviour unchanged: env var names and defaults, visitor-facing messages, log message text and log field names (`conn`, `ip`, `reason`, …), keybindings, HTTP responses.
- Only dependency change: add `zod` (^4.6).
- File names kebab-case; React components PascalCase; hooks `useXxx.ts`; `*.types.ts` / `*.constants.ts` for files holding only types / constants.
- Named exports only. No barrel `index.ts` files.
- Expressive variable names in all code touched, tests included: no `s`, `i`, `x`, `cb`, `err`, `conn`, `cv`, `sock`, `ctx`, `req`, `res`. Only exception: `z`.
- Comments explain why; existing explanatory comments move with their code.
- `.tsx` files only under `src/ui/`.
- Tests sit next to the file they cover.
- Every task ends with `pnpm typecheck` and `pnpm test` passing.
- Stop after each phase (end of Tasks 3, 6, 10) and wait for the user's go-ahead.

## Review Focus

1. **Colour lost for visitors** if `force-color-env` stops being the very first import of `main.ts` (or of the e2e test). Expect coloured output. Pinned by the e2e test added in Task 3 that asserts an SGR colour escape in raw output, plus the first-line check in Task 3.
2. **Empty env vars** (`HOST=''`, `LOG_LEVEL=''`) must give defaults, not crash or bind every interface. Pinned in Task 1's tests.
3. **Bad config at startup** must print `NAME: message` for every problem and exit non-zero before anything listens. Pinned in Task 1 (`ConfigError` message) and the manual check in Task 3.
4. **Idle visitors** must still be disconnected with the idle goodbye, timed from raw channel bytes. Not tested today; Task 9 adds an e2e test before moving the session code.
5. **Graceful shutdown on SIGTERM** must still use `process.on`, not `once` (Ink's signal-exit would cut shutdown short). The existing e2e shutdown test covers `shutdown()`; Task 3 keeps the handler and its comment verbatim.

---

## Phase 1: config, logging, entry point

### Task 1: Zod config

**Files:**
- Create: `src/config/config.schema.ts`, `src/config/load-config.ts`
- Test: `src/config/load-config.test.ts`
- Modify: `package.json` (add `zod`), `src/server.ts`, `src/index.ts`, `src/server.test.ts` (new key names)
- Delete: `src/config.ts`

**Interfaces:**
- Produces:
  - `type Config = { listenHost: string; sshPort: number; httpPort: number; hostKeyPath: string; contentDir: string; idleTimeoutMs: number; maxSessions: number; maxSessionsPerIp: number; handshakeTimeoutMs: number; proxyProtocol: boolean; logLevel: LogLevel }` (inferred from the schema's output)
  - `type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'`
  - `class ConfigError extends Error` whose `message` is one `NAME: message` line per problem
  - `loadConfig(env: NodeJS.ProcessEnv = process.env): Config` (throws `ConfigError`)

- [ ] **Step 1: `pnpm add zod@^4.6`**

- [ ] **Step 2: Write the failing tests** in `src/config/load-config.test.ts`

```ts
test('defaults apply when nothing is set', () => {
  assert.deepEqual(loadConfig({}), {
    listenHost: '0.0.0.0', sshPort: 2222, httpPort: 8080,
    hostKeyPath: '.data/host_ed25519', contentDir: 'content',
    idleTimeoutMs: 180_000, maxSessions: 20, maxSessionsPerIp: 2,
    handshakeTimeoutMs: 30_000, proxyProtocol: false, logLevel: 'info',
  });
});

test('empty strings fall back to defaults, for every variable', () => {
  const names = ['HOST','PORT','HEALTH_PORT','HOST_KEY_PATH','CONTENT_DIR','IDLE_TIMEOUT_SECONDS',
    'MAX_SESSIONS','MAX_SESSIONS_PER_IP','HANDSHAKE_TIMEOUT_SECONDS','PROXY_PROTOCOL','LOG_LEVEL'];
  const allEmpty = Object.fromEntries(names.map((name) => [name, '']));
  assert.deepEqual(loadConfig(allEmpty), loadConfig({}));
});

test('env values are read and seconds become milliseconds', () => {
  const config = loadConfig({ PORT: '22', IDLE_TIMEOUT_SECONDS: '5', PROXY_PROTOCOL: '1', LOG_LEVEL: 'debug' });
  assert.equal(config.sshPort, 22);
  assert.equal(config.idleTimeoutMs, 5000);
  assert.equal(config.proxyProtocol, true);
  assert.equal(config.logLevel, 'debug');
});

test('a bad integer names the variable and the value', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), (error) =>
    error instanceof ConfigError && /^PORT: .*"abc"/m.test(error.message));
  assert.throws(() => loadConfig({ MAX_SESSIONS: '-1' }), ConfigError);
  assert.throws(() => loadConfig({ MAX_SESSIONS: '1.5' }), ConfigError);
});

test('booleans accept only true, false, 1 and 0', () => {
  assert.equal(loadConfig({ PROXY_PROTOCOL: 'false' }).proxyProtocol, false);
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'yes' }), /^PROXY_PROTOCOL: /m);
  assert.throws(() => loadConfig({ PROXY_PROTOCOL: 'TRUE' }), /^PROXY_PROTOCOL: /m);
});

test('an unknown log level is refused', () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), /^LOG_LEVEL: /m);
});

test('every problem is reported, not just the first', () => {
  assert.throws(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    (error) => error instanceof ConfigError && /^PORT: /m.test(error.message) && /^LOG_LEVEL: /m.test(error.message));
});
```

- [ ] **Step 3: Run `pnpm test`**; expected: load-config tests FAIL (module not found).

- [ ] **Step 4: Implement `config.schema.ts`**

Schema keyed by env var names (so issue paths are the names), with a `.transform` to the `Config` keys. A shared preprocess turns `''` into `undefined` before every field so `.default()` applies. Integers: `z.coerce.number().int().nonnegative()` with a custom error `expected a non-negative integer, got "<raw>"`. Boolean: `z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'], case: 'sensitive' })`. Log level: `z.enum([...])`. Keep the existing doc comments from `config.ts` on the matching fields.

- [ ] **Step 5: Implement `load-config.ts`**: `safeParse(env)`; on failure throw `ConfigError` with one `${issue.path.join('.')}: ${issue.message}` line per issue.

- [ ] **Step 6: Switch callers.** `index.ts` uses `loadConfig()`; `server.ts` reads `config.listenHost` / `config.sshPort`; `index.ts` uses `config.httpPort`; `server.test.ts` builds from `loadConfig({})` and overrides `listenHost` / `sshPort`. Delete `src/config.ts`.

- [ ] **Step 7: Run `pnpm typecheck && pnpm test`**; expected: all PASS.

- [ ] **Step 8: Commit** `refactor(config): validate config with zod at startup`

### Task 2: Logger built from config

**Files:**
- Create: `src/logging/create-logger.ts`
- Modify: `src/server.ts`, `src/session.tsx`, `src/index.ts`, `src/server.test.ts`
- Delete: `src/log.ts`

**Interfaces:**
- Consumes: `LogLevel` from Task 1.
- Produces: `createLogger(level: LogLevel): Logger`, `type Logger = pino.Logger`. `startServer(config: Config, logger: Logger)` (renamed in Task 6).

- [ ] **Step 1: Implement `createLogger`** (keep the JSON-lines comment from `log.ts`).
- [ ] **Step 2: Thread the logger.** `startServer` takes `logger` and uses it everywhere `log` was used, including `loadOrCreateHostKey` (pass it as a parameter). `session.tsx` already receives a logger via options; change only its type import. `server.test.ts` passes `createLogger('silent')`. Delete `src/log.ts`.
- [ ] **Step 3: Run `pnpm typecheck && pnpm test`**; expected: PASS, and `grep -rn "from './log.js'" src` prints nothing.
- [ ] **Step 4: Commit** `refactor(logging): create the logger from config and pass it down`

### Task 3: HTTP server, `main.ts`, colour env

**Files:**
- Create: `src/http/create-http-server.ts`, `src/main.ts`, `src/terminal/force-color-env.ts`
- Test: `src/http/create-http-server.test.ts` (moved from `src/health.test.ts`)
- Modify: `src/server.test.ts` (import path, colour assertion), `package.json` (`dev`, `start`), `Dockerfile` (`CMD ["dist/main.js"]`)
- Delete: `src/health.ts`, `src/health.test.ts`, `src/index.ts`, `src/env.ts`

**Interfaces:**
- Produces: `createHttpServer(isReady: () => boolean): http.Server`. It doesn't log; `main.ts` logs `health endpoints listening` with `{ port }` as today. (Spec says the logger is passed to whatever needs it; this doesn't.)

- [ ] **Step 1: Write the failing colour test** in `src/server.test.ts`; capture raw (unstripped) output in `visit` as a `rawOutput()` accessor.

```ts
test('visitors get colour, even though the server has no TTY', async () => {
  const { server, port } = await start();
  try {
    const session = await visit(port);
    await session.waitFor('Hello from the test.');
    assert.match(session.rawOutput(), /\x1b\[(3\d|38;5;\d+)m/);
    session.channel.write('q');
    await session.exitCode;
  } finally {
    await server.shutdown();
  }
});
```

- [ ] **Step 2: Run `pnpm test`**; expected: it PASSES already (characterisation test pinning today's behaviour). If it fails, stop and report: the premise is wrong.
- [ ] **Step 3: Move** `env.ts` → `terminal/force-color-env.ts`; `health.ts` → `http/create-http-server.ts` renamed `createHttpServer`, with `request` / `response` instead of `req` / `res`; `health.test.ts` → `http/create-http-server.test.ts` with `baseUrl` instead of `base`. Update the test's import of the colour env.
- [ ] **Step 4: Write `main.ts`** from `index.ts`. First line `import './terminal/force-color-env.js';` with the "must stay the first import" comment. Wrap `loadConfig()` in try/catch: on `ConfigError`, `console.error(error.message)` and `process.exit(1)`; rethrow anything else. Then `createLogger(config.logLevel)`, `startServer(config, logger)`, `createHttpServer(...)`. Keep the signal handler and both comments verbatim; rename `shuttingDown` → `isShuttingDown`, `health` → `httpServer`, `server` → `sshServer`.
- [ ] **Step 5: Point `package.json` `dev` at `src/main.ts` and `start` at `dist/main.js`; Dockerfile `CMD ["dist/main.js"]`.**
- [ ] **Step 6: Verify.** `pnpm typecheck && pnpm test` PASS. `head -1 src/main.ts` prints the force-color import. `pnpm build && PORT=abc node dist/main.js; echo $?` prints a `PORT: …"abc"` line and `1`. `pnpm dev`, then `ssh -p 2222 localhost` shows the coloured CV.
- [ ] **Step 7: Commit** `refactor: main.ts entry point, createHttpServer, colour env under terminal/`

**→ Phase 1 stop.** Summarise for the user, call out the empty-env-var behaviour change, wait for go-ahead.

---

## Phase 2: `ssh/`

### Task 4: `ssh/proxy-protocol/`

**Files:**
- Create: `src/ssh/proxy-protocol/{proxy-header.types.ts, proxy-header.constants.ts, parse-proxy-header.ts, parse-v1.ts, parse-v2.ts, read-proxy-header.ts, apply-proxied-address.ts}`
- Test: `src/ssh/proxy-protocol/parse-proxy-header.test.ts` (moved from `src/proxy.test.ts`)
- Modify: `src/server.ts`
- Delete: `src/proxy.ts`, `src/proxy.test.ts`

**Interfaces:**
- Produces:
  - `ProxySource`, `ProxyHeader` (unchanged shapes) in `proxy-header.types.ts`; `ProxyHeaderReadResult = { kind: 'header'; source?: ProxySource; remainingBytes: Buffer } | { kind: 'invalid'; reason: string }`
  - `parseProxyHeader(data: Buffer): ProxyHeader`; `parseV1(data: Buffer): ProxyHeader`; `parseV2(data: Buffer): ProxyHeader`
  - `readProxyHeader(socket: Socket): Promise<ProxyHeaderReadResult>`: buffers `data` until the header is complete, detaches its listener and pauses the socket before resolving. It neither logs nor destroys; the caller does.
  - `applyProxiedAddress(socket: Socket, source: ProxySource): void` (was `useProxiedAddress`)

- [ ] **Step 1: Move the parser** across the files above; `ipv6` becomes `formatIpv6Address(bytes: Buffer): string` inside `parse-v2.ts`; loop variable `i` becomes `byteOffset`. Move its test; only the import changes.
- [ ] **Step 2: Extract `readProxyHeader` and `applyProxiedAddress`** from the TCP listener in `server.ts`, which now `await`s `readProxyHeader`, logs `connection dropped` with `{ peer, reason }` and destroys on `invalid`, otherwise applies the source and hands over `remainingBytes`.
- [ ] **Step 3: Run `pnpm typecheck && pnpm test`**; expected: PASS, including both relay e2e tests.
- [ ] **Step 4: Commit** `refactor(ssh): proxy-protocol module under ssh/`

### Task 5: `ssh/session-limits/`

**Files:**
- Create: `src/ssh/session-limits/session-limiter.ts`, `src/ssh/session-limits/admission.types.ts`
- Test: `src/ssh/session-limits/session-limiter.test.ts` (moved from `src/limits.test.ts`)
- Delete: `src/limits.ts`, `src/limits.test.ts`

**Interfaces:**
- Produces: `class SessionLimiter { constructor(maxSessions: number, maxSessionsPerIp: number); tryAcquire(clientIp: string): Admission; get activeSessionCount(): number }`. `Admission` and `RefusalReason = 'server-full' | 'ip-limit'` in `admission.types.ts`. Internals renamed: `total` → `activeSessionCount` backing field, `perIp` → `sessionsPerIp`, `fromIp` → `sessionsFromIp`.

- [ ] **Step 1: Move and rename**, update `server.ts` (`limiter.active` → `sessionLimiter.activeSessionCount`; the log field stays `active`).
- [ ] **Step 2: Run `pnpm typecheck && pnpm test`**; expected: PASS.
- [ ] **Step 3: Commit** `refactor(ssh): session-limits module under ssh/`

### Task 6: Split `server.ts` into `ssh/`

**Files:**
- Create: `src/ssh/{create-ssh-server.ts, ssh-server.types.ts, host-key.ts, tcp-listener.ts, client-handlers.ts, forwarding-refusal.ts, session-channel-handlers.ts, refuse-channel.ts, rejection-messages.ts}`
- Test: `src/ssh/create-ssh-server.test.ts` (moved from `src/server.test.ts`)
- Modify: `src/main.ts`
- Delete: `src/server.ts`, `src/server.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5.
- Produces:
  - `interface SshServer { listening: Promise<AddressInfo>; isReady(): boolean; shutdown(): Promise<void> }` (was `CvServer`)
  - `createSshServer(config: Config, logger: Logger): SshServer` (was `startServer`)
  - `loadOrCreateHostKey(path: string, logger: Logger): Buffer`
  - `refuseChannel(channel: ServerChannel, message: string): void`
  - `REJECTION_MESSAGES: Record<RefusalReason | 'shutting-down' | 'no-terminal' | 'commands-unsupported', string>`. The two inline messages move here, text unchanged.
  - `refuseForwarding(client: Connection, connectionLogger: Logger): void`
  - `interface SessionChannelContext { config: Config; connectionLogger: Logger; clientIp: string; sessionLimiter: SessionLimiter; activeSessions: Set<CvSession>; isShuttingDown: () => boolean }`; `handleSessionChannel(session: Session, context: SessionChannelContext): void`
  - `handleClient(client: Connection, clientInfo: ClientInfo, context: Omit<SessionChannelContext, 'connectionLogger' | 'clientIp'> & { logger: Logger }): void`: creates the connection logger (`conn`, `ip` fields unchanged), handshake timer, auth, then `refuseForwarding` and `handleSessionChannel` on `ready`, error/close logging
  - `createTcpListener(sshServer: ssh2.Server, options: { handshakeTimeoutMs: number; proxyProtocol: boolean; logger: Logger }): net.Server`
  - `SHUTDOWN_GRACE_MS` stays in `create-ssh-server.ts`

- [ ] **Step 1: Move `server.test.ts`** to `ssh/create-ssh-server.test.ts`, call `createSshServer(config, createLogger('silent'))`, and rename test helpers' short names (`cb` → `callback`, `err` → `error`, `sock` → `relaySocket`, `done` → `resolveExit` / `resolveWait`, `raw` → `rawOutput` state). Assertions unchanged. Run it: FAIL (module not found).
- [ ] **Step 2: Split `server.ts`** into the files above. `create-ssh-server.ts` keeps only: host key, limiter, active-session set, ssh2 `Server` construction with `handleClient`, `maxConnections` cap (keep its comment), `createTcpListener`, `listening`, `isReady`, `shutdown`. Rename locals: `connLog` → `connectionLogger`, `cv` → `cvSession`, `size` → `windowSize`, `term` → `terminalType`, `tcp` → `tcpServer`, `received` → `receivedBytes`, `early` → `earlySshBytes`, `info` → `clientInfo` / `requestInfo`.
- [ ] **Step 3: Update `main.ts`** to `createSshServer`.
- [ ] **Step 4: Run `pnpm typecheck && pnpm test`**; expected: PASS, all eight e2e tests.
- [ ] **Step 5: Commit** `refactor(ssh): split the SSH server into focused files`

**→ Phase 2 stop.** Summarise, wait for go-ahead.

---

## Phase 3: terminal, session, content, UI

### Task 7: `terminal/`

**Files:**
- Create: `src/terminal/{window-size.types.ts, terminal-input.ts, terminal-output.ts, create-terminal.ts}`
- Modify: importers of `WindowSize` / `createTerminal`
- Delete: `src/terminal.ts`

**Interfaces:**
- Produces: `WindowSize`; `TerminalInput`, `TerminalOutput` (now exported); `interface Terminal { stdin: TerminalInput; stdout: TerminalOutput }`; `createTerminal(channel: ServerChannel, windowSize: WindowSize): Terminal`.

- [ ] **Step 1: Split**, keeping the class doc comments verbatim.
- [ ] **Step 2: Run `pnpm typecheck && pnpm test`**; expected: PASS.
- [ ] **Step 3: Commit** `refactor(terminal): split terminal adapter into its own folder`

### Task 8: `content/` and `rendering/`

**Files:**
- Create: `src/content/{content.types.ts, load-content.ts, parse-header.ts, title-from-filename.ts}`, `src/rendering/{render-markdown.ts, marked-terminal-fixes.ts, render-banner.ts}`
- Test: `src/content/load-content.test.ts`, `src/rendering/render-markdown.test.ts`, `src/rendering/render-banner.test.ts` (split from `src/content.test.ts` by subject)
- Delete: `src/content.ts`, `src/content.test.ts`

**Interfaces:**
- Produces: `Section`, `Header`, `CvContent`; `loadContent(contentDir: string): CvContent`; `parseHeader(markdown: string): Header | undefined`; `titleFromFilename(filename: string): string`; `renderMarkdown(markdown: string, width: number): string`; `markedTerminalFixes(width: number): MarkedExtension` (was `fixes`); `renderBanner(name: string, maxWidth: number): string | undefined`; `BANNER_FONTS` and `LIST_TEXT_INDENT` stay private in their files.

- [ ] **Step 1: Split tests** into the three files (tests 1–3 → load-content, 4–6 → render-markdown, 7 → render-banner); run: FAIL (modules not found).
- [ ] **Step 2: Split the code**; rename `file` → `filename`, `match` → `headingMatch`, `art` → `bannerArt`, `inline` → `inlineText`.
- [ ] **Step 3: Run `pnpm typecheck && pnpm test`**; expected: PASS.
- [ ] **Step 4: Commit** `refactor: content loading and terminal rendering in their own folders`

### Task 9: `cv-session/` and `ui/mount-app.tsx`

**Files:**
- Create: `src/ui/mount-app.tsx`, `src/cv-session/{start-cv-session.ts, goodbye-messages.ts, cv-session.types.ts}`
- Modify: `src/ssh/create-ssh-server.test.ts` (idle test), `src/ssh/session-channel-handlers.ts`, `src/ssh/create-ssh-server.ts` (imports)
- Delete: `src/session.tsx`

**Interfaces:**
- Produces:
  - `mountApp(terminal: Terminal, appProps: AppProps): Instance` (Ink's `Instance`); holds the Ink render options, unchanged. Export `AppProps` from `App.tsx`.
  - `CvSession`, `CvSessionOptions`, `EndReason` in `cv-session.types.ts`; `GOODBYE_MESSAGES: Partial<Record<EndReason, string>>`
  - `startCvSession(channel: ServerChannel, windowSize: WindowSize, options: CvSessionOptions): CvSession` in a plain `.ts` file

- [ ] **Step 1: Add the idle e2e test** to `create-ssh-server.test.ts` and run it against the current code; expected: PASS (characterisation).

```ts
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
```

- [ ] **Step 2: Move** the `render(<App/>, …)` call into `mountApp`; the rest of `session.tsx` becomes `start-cv-session.ts`. Rename `instance` → `inkInstance`, `reason` → `endReason`, `closed` → `isChannelClosed`. Idle timer stays on `channel.on('data')` with its comment.
- [ ] **Step 3: Run `pnpm typecheck && pnpm test`**; expected: PASS; `find src -name '*.tsx' -not -path 'src/ui/*'` prints nothing.
- [ ] **Step 4: Commit** `refactor: cv-session lifecycle in plain TS, Ink mounting in ui/`

### Task 10: Split `App.tsx`, README, final sweep

**Files:**
- Create: `src/ui/components/{Banner.tsx, TabBar.tsx, Footer.tsx, TooSmallNotice.tsx}`, `src/ui/hooks/{useScroll.ts, useKeyboardNavigation.ts}`, `src/ui/layout.constants.ts`
- Modify: `src/ui/App.tsx`, `README.md`

**Interfaces:**
- Consumes: `renderMarkdown`, `renderBanner`, `CvContent`, `Header` from Task 8.
- Produces: `App` with unchanged `AppProps`. Component and hook signatures are the builder's call (spec: "left to the builder"), as long as `App.tsx` reads as composition: layout constants out, scroll state in `useScroll`, the `useInput` key map in `useKeyboardNavigation`.

- [ ] **Step 1: Split** `App.tsx`. Rename `s`, `i` → `section`, `sectionIndex`; `page` → `pageSize`; `art` → `bannerArt`. Keybindings and rendered text unchanged.
- [ ] **Step 2: README.** Update the `src/terminal.ts` reference to `src/terminal/`; mention that config is validated at startup and empty values fall back to defaults.
- [ ] **Step 3: Naming sweep.** `grep -rnE '\b(const|let|var)\s+[a-z]\b|\(([a-z]|err|cb|ctx|req|res)[,)]|\b(err|cb|ctx|conn|cv)\b' src` and fix every hit except `z`. Confirm no `index.ts` and no default exports: `grep -rn 'export default' src` prints nothing.
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm test` PASS; `pnpm dev`, then `ssh -p 2222 localhost`: tabs, scrolling, resize, `q` all behave as before.
- [ ] **Step 5: Commit** `refactor(ui): split App into components and hooks; docs`

**→ Phase 3 stop.** Summarise, wait for the user to decide on review and merge.
