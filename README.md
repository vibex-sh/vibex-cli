# vibex CLI

Zero-config observability CLI - pipe logs and visualize instantly.

## Quick Start

```bash
# Production (default)
echo '{"cpu": 45, "memory": 78}' | vibex
```

## Installation

```bash
npm install -g vibex-sh
```

## Usage

Pipe any output to `vibex`:

```bash
# JSON logs
echo '{"cpu": 45, "memory": 78}' | vibex

# Script output
python script.py | vibex
node server.js | vibex
docker logs -f | vibex

# Reuse session
echo '{"more": "data"}' | vibex --session-id vibex-abc123
```

## Options

| Flag | Description | Example |
|------|-------------|---------|
| `-s, --session-id <id>` | Reuse existing session | `vibex --session-id vibex-abc123` |
| `--web <url>` | Web server URL | `vibex --web https://vibex.sh` |
| `--socket <url>` | Socket server URL | `vibex --socket wss://ingest.vibex.sh` |
| `--server <url>` | Shorthand for `--web` (auto-derives socket) | `vibex --server https://vibex.sh` |

## Server Configuration

The CLI automatically derives the socket URL from the web URL, but you can override it:

```bash
# Production (auto-derives socket URL)
vibex --server https://vibex.sh

# Custom domain
vibex --web https://staging.vibex.sh --socket wss://ingest-staging.vibex.sh
```

## Priority Order

1. **Flags** (`--web`, `--socket`, `--server`)
2. **Environment variables** (`VIBEX_WEB_URL`, `VIBEX_SOCKET_URL`)
3. **Production defaults** (`https://vibex.sh`, `wss://ingest.vibex.sh`)

## Environment Variables

```bash
export VIBEX_WEB_URL=https://vibex.sh
export VIBEX_SOCKET_URL=wss://ingest.vibex.sh
```

## Examples

```bash
# Production (default)
echo '{"data": 123}' | vibex

# Custom web server, auto socket
echo '{"data": 123}' | vibex --server https://vibex.sh

# Staging
echo '{"data": 123}' | vibex --server https://staging.vibex.sh
```

## License

MIT
