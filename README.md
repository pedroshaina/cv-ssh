# cv-ssh

My CV as a terminal app served over SSH, in the spirit of `ssh terminal.shop`. Visitors connect
with any SSH client and browse it as a TUI: no account, no key, no password.

```
ssh -p 2222 localhost   # when running locally
```

## How it works

There is no shell on the other end. The SSH server *is* the app:

- [`ssh2`](https://github.com/mscdotnet/ssh2) accepts every connection (any auth method), waits
  for the client's PTY request and opens the shell channel.
- Each session mounts an [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
  app on that channel. `src/terminal.ts` makes the channel look like a TTY to Ink: window size,
  resize events, raw input and `\n` → `\r\n` (there is no kernel PTY to do it).
- The content is Markdown, rendered to ANSI with
  [`marked-terminal`](https://github.com/mikaelbr/marked-terminal); the name banner is
  [`figlet`](https://github.com/patorjk/figlet.js).

## Editing the CV

Everything is in `content/`, read on every connection (no restart needed):

| File | Becomes |
|---|---|
| `_header.md` | The banner: its `# Heading` is the name, the rest the tagline |
| `NN-title.md` | A tab, ordered by `NN`; `03-side-projects.md` → "Side projects" |

Files starting with `_` are never tabs.

## Development

Needs Node 24 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # server on :2222 with pretty logs, restarts on code changes
pnpm test         # unit tests + end-to-end SSH sessions against a real server
pnpm typecheck
```

Keys: ←/→ (or h/l, Tab) sections, 1–9 jump, ↑/↓ (or j/k) scroll, space/b page, g/G top/bottom,
q to quit.

## Configuration

Environment variables, all optional:

| Variable | Default | |
|---|---|---|
| `PORT` | `2222` | SSH port |
| `HEALTH_PORT` | `8080` | HTTP `GET /health` and `GET /ready` |
| `HOST_KEY_PATH` | `.data/host_ed25519` | Server host key; generated if missing |
| `CONTENT_DIR` | `content` | Markdown directory |
| `IDLE_TIMEOUT_SECONDS` | `180` | Disconnect after this long without a keypress |
| `MAX_SESSIONS` | `20` | Concurrent sessions in total |
| `MAX_SESSIONS_PER_IP` | `2` | Concurrent sessions per client IP; `0` disables |
| `HANDSHAKE_TIMEOUT_SECONDS` | `30` | Time to connect and authenticate |
| `LOG_LEVEL` | `info` | pino level; logs are JSON lines on stdout |

The host key is the server's identity: keep it stable, or returning visitors get a "remote host
identification has changed" warning.

## Container and releases

`Dockerfile` builds a `linux/amd64` image on distroless Node 24, running as non-root with the
content baked in. On `SIGTERM` the server stops accepting connections, tells open sessions it is
restarting, and exits once they have left.

A merge to `master` tests, builds and publishes the image, then hands it to the homelab's GitOps
repository for deployment (`.github/workflows/release.yaml`).
