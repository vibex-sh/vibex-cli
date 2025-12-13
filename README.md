# vibex CLI

Zero-config observability CLI - pipe logs and visualize instantly.

## Quick Start

```bash
# Production (default)
echo '{"cpu": 45, "memory": 78}' | vibex

# Local development
echo '{"test": 123}' | vibex --local

# Custom ports
echo '{"data": 123}' | vibex --web http://localhost:3000 --socket http://localhost:8080
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
| `-l, --local` | Use localhost (web: 3000, socket: 3001) | `vibex --local` |
| `--web <url>` | Web server URL | `vibex --web http://localhost:3000` |
| `--socket <url>` | Socket server URL | `vibex --socket http://localhost:8080` |
| `--server <url>` | Shorthand for `--web` (auto-derives socket) | `vibex --server http://localhost:3000` |

## Server Configuration

The CLI automatically derives the socket URL from the web URL, but you can override it:

```bash
# Auto-derive socket (localhost:3000 → localhost:3001)
vibex --web http://localhost:3000

# Explicit socket URL
vibex --web http://localhost:3000 --socket http://localhost:8080

# Production (auto-derives socket.vibex.sh)
vibex --server https://vibex.sh

# Custom domain
vibex --web https://staging.vibex.sh --socket https://socket-staging.vibex.sh
```

## Priority Order

1. **Flags** (`--web`, `--socket`, `--local`, `--server`)
2. **Environment variables** (`VIBEX_WEB_URL`, `VIBEX_SOCKET_URL`)
3. **Production defaults** (`https://vibex.sh`, `https://socket.vibex.sh`)

## Environment Variables

```bash
export VIBEX_WEB_URL=http://localhost:3000
export VIBEX_SOCKET_URL=http://localhost:8080
```

## Examples

```bash
# Production (default)
echo '{"data": 123}' | vibex

# Quick localhost
echo '{"data": 123}' | vibex --local

# Custom web server, auto socket
echo '{"data": 123}' | vibex --server http://localhost:3000

# Both custom
echo '{"data": 123}' | vibex --web http://localhost:3000 --socket http://localhost:8080

# Staging
echo '{"data": 123}' | vibex --server https://staging.vibex.sh
```

## License

MIT
