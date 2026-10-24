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
- The shell is all it offers. Commands get a one-line refusal. Port forwarding (`-L`, `-D`, `-W`,
  `-R`, Unix sockets), sftp and other subsystems, and agent and X11 forwarding are rejected. Each
  forwarding attempt is logged at `warn` as `forwarding refused`. A visitor's client never sends
  one, so every such line means someone is probing.

## Editing the CV

Everything is in `content/`, read on every connection (no restart needed):

| File | Becomes |
|---|---|
| `_header.md` | The banner: its `# Heading` is the name, the rest the tagline |
| `NN-title.md` | A tab, ordered by `NN`; `03-side-projects.md` → "Side projects" |

Files starting with `_` are never tabs.

Paragraphs and list items are re-wrapped to the visitor's terminal (at most 80 columns), so line
breaks in the source don't matter: consecutive lines join into one. Put things that must stay on
separate lines in a list (`- **Email:** …`) or join them with ` · `.

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
| `PROXY_PROTOCOL` | `false` | Require a PROXY protocol header (v1 or v2) on every connection; see below |
| `LOG_LEVEL` | `info` | pino level; logs are JSON lines on stdout |

Behind a relay (a TCP proxy in front of the server), every connection comes from the relay's
address, so the per-IP limit and the logs see one visitor. Set `PROXY_PROTOCOL=true` and have the
relay send a PROXY header (HAProxy `send-proxy-v2`, nginx `proxy_protocol on`): the server then
uses the visitor address it carries. Connections without a valid header are dropped. The header
itself is trusted, so only the relay must be able to reach the SSH port (a network policy):
anyone else who can would be able to claim any address. A header with no address (HAProxy's
health checks) keeps the relay's.

The host key is the server's identity: keep it stable, or returning visitors get a "remote host
identification has changed" warning.

## Container and releases

`Dockerfile` builds a `linux/amd64` image on distroless Node 24, running as non-root with the
content baked in. On `SIGTERM` the server stops accepting connections, tells open sessions it is
restarting, and exits once they have left.

A merge to `master` tests, builds and publishes the image, then hands it to the homelab's GitOps
repository for deployment (`.github/workflows/release.yaml`).
