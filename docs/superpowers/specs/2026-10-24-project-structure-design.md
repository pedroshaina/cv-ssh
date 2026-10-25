# Project structure refactor

## Why

The server works, but the code is hard to read. Everything sits flat in `src/`, single files mix
types, constants and logic (`server.ts` handles host keys, TCP, PROXY protocol, auth, forwarding
refusal, sessions and shutdown in 256 lines), and names are vague (`createServer` for SSH next to
`createHealthServer` for HTTP, `s`, `i`). Config is validated by hand.

The goal: **the code explains itself.** Opening a domain folder shows everything related to that
domain. The folder name, plus the file names inside it, plus a skim of the files, gives a rough
understanding of the module and what it can do.

## Goals

- Domain folders, each holding everything related to that domain.
- Small files, one responsibility each; types and constants in their own files when a domain has
  more than one or two.
- Explicit names: `createSshServer`, `createHttpServer`, `sshPort`, `httpPort`.
- Expressive variable names everywhere. No `s`, `x`, `i`, `conn`, `cv`. Exceptions only for
  conventions: `z` for Zod.
- Config validated with Zod once at startup; a bad value stops the process before anything listens.

## Non-goals

- No behaviour changes, with one deliberate exception (empty env vars, see Config). Same env
  vars and defaults, same visitor-facing messages, same log
  messages and log fields, same keybindings, same HTTP responses.
- No new features, no dependency changes besides adding `zod`.
- No changes to `content/`.

## Anti-goals

- Over-engineering: no folders that exist only for tidiness (an earlier `process/` folder was
  dropped for this reason), no barrel `index.ts` files, no abstraction layers or DI containers.
- Top-level folders that suggest something is shared when only one domain uses it.

## Final structure

```
src/
  main.ts                          imports force-color-env first, loads config,
                                   creates logger, starts ssh + http,
                                   handles SIGTERM/SIGINT
  config/
    config.schema.ts               zod schema: env names, defaults, coercion,
                                   seconds → ms, LOG_LEVEL as pino levels
    load-config.ts                 parses process.env, fails fast with readable errors
  logging/
    create-logger.ts               createLogger(level), Logger type
  ssh/
    create-ssh-server.ts           ties it all together, returns SshServer
    ssh-server.types.ts
    host-key.ts                    loadOrCreateHostKey
    tcp-listener.ts                silent-socket timeout, PROXY header, hand-over to ssh2
    client-handlers.ts             auth, handshake timeout, error/close
    forwarding-refusal.ts          tcpip / streamlocal / global requests
    session-channel-handlers.ts    pty, window-change, shell, exec, subsystems
    refuse-channel.ts
    rejection-messages.ts
    proxy-protocol/
      parse-proxy-header.ts        picks v1 or v2
      parse-v1.ts
      parse-v2.ts
      proxy-header.types.ts
      proxy-header.constants.ts
      read-proxy-header.ts         buffers socket data until the header is complete
      apply-proxied-address.ts
    session-limits/
      session-limiter.ts
      admission.types.ts
  http/
    create-http-server.ts          /health and /ready
  terminal/
    force-color-env.ts             must load before chalk; imported first by main
    terminal-input.ts
    terminal-output.ts
    create-terminal.ts
    window-size.types.ts
  cv-session/
    start-cv-session.ts            lifecycle only: idle timer, goodbye, logging, slot release
    goodbye-messages.ts
    cv-session.types.ts
  content/
    load-content.ts
    parse-header.ts
    title-from-filename.ts
    content.types.ts
  rendering/
    render-markdown.ts
    marked-terminal-fixes.ts
    render-banner.ts
  ui/
    mount-app.tsx                  mountApp(...) → Ink instance; the only render() call
    App.tsx
    components/
      Banner.tsx
      TabBar.tsx
      Footer.tsx
      TooSmallNotice.tsx
    hooks/
      useScroll.ts
      useKeyboardNavigation.ts
    layout.constants.ts
```

### Decisions behind the structure

- **`proxy-protocol/` and `session-limits/` live under `ssh/`.** Only the SSH path uses them.
  Opening `ssh/` should reveal that a PROXY header is read before SSH bytes and that sessions are
  limited. The proxy parser stays free of SSH imports, so lifting it out later is a folder move.
- **No `process/` folder.** Signal handling is ~10 lines and lives in `main.ts`. The colour env
  setup cannot be inlined (ES module imports are hoisted, so code in `main.ts` runs after chalk has
  already fixed its colour level); it lives in `terminal/force-color-env.ts`, since it exists so
  visitors' terminals get colour, and `main.ts` imports it first with a comment saying why.
- **`.tsx` only inside `ui/`.** Today `session.tsx` is `.tsx` only for one `render(<App/>)` line.
  That moves to `ui/mount-app.tsx` (a plain function, not a hook: hooks need an already-mounted
  tree, and this is what creates it). `cv-session/start-cv-session.ts` is plain TypeScript and
  calls `mountApp`. React owns the screen; `cv-session` owns the connection's lifetime.
- **Idle timeout stays outside React.** It keeps watching raw channel bytes, as today. Moving it
  into a hook would change behaviour slightly and need an exit-reason callback.

## Config

- Add `zod` (v4) as a dependency.
- `config.schema.ts` declares every env var with its default; `load-config.ts` parses
  `process.env` once, in `main.ts`. On failure, print each problem as `NAME: message` (e.g.
  `PORT: expected a non-negative integer, got "abc"`) via `console.error` (no logger exists yet)
  and exit with a non-zero code.
- Env var names and defaults are unchanged (see README table), so deployments don't change.
- An empty string counts as unset for **every** var, so it gets the default. Today only the
  number and boolean vars do this; the string vars (`HOST`, `HOST_KEY_PATH`, `CONTENT_DIR`,
  `LOG_LEVEL`) pass `''` through, which binds every interface, reads the cwd, fails to write the
  host key, or crashes pino. This is the one deliberate behaviour change in the refactor: call it
  out in the phase 1 summary and cover it in the `load-config` test.
- `*_SECONDS` vars stay in seconds in env and are converted to ms in the schema; the code only
  sees `idleTimeoutMs` / `handshakeTimeoutMs`.
- `PROXY_PROTOCOL` keeps accepting `true` / `false` / `1` / `0` and nothing else.
- `LOG_LEVEL` joins the schema, validated against pino's level names (including `silent`, which
  `pnpm test` uses).
- Config keys become explicit: `host` → `listenHost`, `port` → `sshPort`,
  `healthPort` → `httpPort`. Env var `HEALTH_PORT` keeps its name (no deployment break).
- The type comes from the schema (`z.infer`). Config is passed down explicitly, never imported
  as a global, so tests build their own.
- `loadConfig(env = process.env)` takes the environment as a parameter, so tests can get
  defaults with `loadConfig({})` and test bad values without touching `process.env`.

## Logging

The logger depends on config, so it can no longer be a module-level global. `main.ts` calls
`createLogger(config.logLevel)` and passes the logger into `createSshServer` and
`createHttpServer` (and from there to whatever needs it), the same way config is passed. Per
connection child loggers stay as they are.

## Conventions

- File names kebab-case; React components and their files PascalCase; hooks `useXxx.ts`.
- `*.types.ts` and `*.constants.ts` suffixes for files holding only types or constants.
- Named exports only. No barrel `index.ts` files: imports point at the actual file.
- Expressive variable names (`socket`, `channel`, `section`, `sectionIndex`), with `z` as the
  only short-name exception.
- Keep the existing comment style: comments explain *why*, not what. Existing explanatory
  comments move with their code.
- Tests sit next to the file they cover (e.g. `ssh/proxy-protocol/parse-proxy-header.test.ts`).

## Things outside `src/` that must follow

- `package.json`: `dev` and `start` point at `main` instead of `index`.
- `Dockerfile`: `CMD ["dist/main.js"]`.
- `README.md`: the "How it works" paragraph references `src/terminal.ts`; update file references.
- `pnpm test` glob (`src/**/*.test.ts`) already covers nested folders.

## Verification

- `pnpm typecheck` and `pnpm test` pass after each phase.
- The end-to-end SSH tests (`server.test.ts`) are the behaviour safety net: they move to
  `ssh/create-ssh-server.test.ts` and change only setup: imports, function names, config keys,
  getting defaults from `loadConfig({})` and passing a silent logger. Their assertions don't change.
- Log message text and log field names (`conn`, `ip`, `reason`, …) are output, not variables, so
  they stay as they are; only the variables holding them get expressive names.
- Add a test for `load-config` covering defaults, empty strings falling back to defaults, a bad
  integer, a bad boolean and a bad log level.
- Manual check: `pnpm dev`, `ssh -p 2222 localhost`, browse, quit; and start with `PORT=abc` to see
  the startup error.

## Delivery

Work in phases, each leaving the project working, each stopping for review:

1. Config (Zod) and logging, `main.ts`, `http/`.
2. `ssh/` including `proxy-protocol/` and `session-limits/`.
3. `terminal/`, `cv-session/`, `content/`, `rendering/`, `ui/`, plus the Dockerfile and README
   updates.

The exact phase boundaries are the builder's call as long as each phase passes typecheck and tests.

## Left to the builder

- How exactly `client-handlers.ts` and `session-channel-handlers.ts` receive their dependencies
  (a small context object is fine).
- How `App.tsx` is split into components and hooks, as long as behaviour is identical.
- Whether a domain with a single type keeps it inline rather than in a `*.types.ts` file.
- Wording of Zod error messages, as long as each names the env var and the bad value.
