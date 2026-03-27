# Release Guide

## Quick Release

```bash
# Build frontend + embed into server + cross-compile all binaries
make build-frontend
make release
```

Output in `dist/`:
```
dist/
├── dashboard-server-linux-amd64
├── dashboard-server-linux-arm64
├── dashboard-cli-linux-amd64
├── dashboard-cli-linux-arm64
├── dashboard-cli-darwin-amd64
├── dashboard-cli-darwin-arm64
├── dashboard-cli-windows-amd64.exe
├── dashboard-worker-linux-amd64
└── dashboard-worker-linux-arm64
```

**Note:** `make release` builds the server WITHOUT the embedded frontend. For a server binary with embedded frontend, use `make build-server` instead (outputs to `bin/dashboard-server`). The release target is primarily for the CLI and worker, which don't need the frontend.

## Binaries

### dashboard-server

The main application. Serves both the REST API and the frontend SPA on a single port.

| Platform | Use case |
|----------|----------|
| `linux-amd64` | Cloud VMs, containers |
| `linux-arm64` | ARM servers, Raspberry Pi |

**Includes embedded frontend** when built with `make build-server`. The Dockerfile also produces a server with embedded frontend.

```bash
# Run
PORT=8080 \
DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=disable \
JWT_SECRET=your-secret \
./dashboard-server
```

### dashboard-cli

Read-only CLI for LLM agents and humans. Connects to the server via API key.

| Platform | Use case |
|----------|----------|
| `linux-amd64/arm64` | Server-side agents |
| `darwin-amd64/arm64` | macOS developers |
| `windows-amd64` | Windows developers |

```bash
# Install via go install
go install github.com/austinjan/industry-dashboard/cmd/dashboard-cli@latest

# Or download binary and configure
./dashboard-cli configure --url https://dashboard.example.com --api-key dk_...
```

### dashboard-worker

Modbus data collector. Deployed to factory edge devices that connect to PLCs.

| Platform | Use case |
|----------|----------|
| `linux-amd64` | Industrial PCs |
| `linux-arm64` | Raspberry Pi, ARM gateways |

```bash
# Run with config
./dashboard-worker -config /etc/dashboard/worker.yaml
```

## Docker

### Build Image

```bash
# Build
make docker-build
# or
docker build -t industry-dashboard .
```

The image includes all 3 binaries. Migrations are embedded in the server binary. Default entrypoint is `dashboard-server`.

### Development (docker-compose.yml)

```bash
make docker-run
# or
docker compose up
```

### Production (docker-compose.production.yml)

```bash
# 1. Copy the example env file and edit
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET at minimum

# 2. Start
docker compose -f docker-compose.production.yml up -d
```

Production compose includes:
- **Required secrets** — `DB_PASSWORD` and `JWT_SECRET` must be set (will error if missing)
- **Health checks** — server waits for DB to be ready before starting
- **Auto-restart** — both services restart on failure
- **Persistent volume** — `pgdata` survives container restarts

**Migrations run automatically on server startup** — no separate step needed.

### Release Package

When distributing to users without the source code, include:

```
release/
├── dashboard-server-linux-amd64    # (or appropriate platform)
├── docker-compose.production.yml
└── .env.example
```

Users just need:
```bash
cp .env.example .env
# Edit .env
docker compose -f docker-compose.production.yml up -d
```

Or without Docker (bring your own TimescaleDB):
```bash
cp .env.example .env
# Edit .env
source .env
DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?sslmode=disable" \
JWT_SECRET="$JWT_SECRET" \
./dashboard-server-linux-amd64
```

## Version Tagging

Binaries embed the git version via `-ldflags`:

```bash
# Check version
./dashboard-server   # logs "dashboard-server version v1.0.0" at startup
./dashboard-cli version  # prints {"version":"v1.0.0"}
```

To create a release:

```bash
git tag v1.0.0
git push origin v1.0.0
make release
```

## GitHub Release (Manual)

1. Tag the release: `git tag v1.0.0 && git push origin v1.0.0`
2. Build: `make build-frontend && make release`
3. Create release on GitHub
4. Upload `dist/*` as release assets
5. Users download the binary for their platform

## Database & Migrations

**Migrations run automatically when the server starts.** The server binary embeds all migration files — no external migration tool or files needed.

On startup the server:
1. Connects to the database
2. Runs any pending migrations (skips if already up to date)
3. Logs the current migration version
4. Starts serving requests

If you prefer manual control, you can still run `make migrate` from the source tree, or set `AUTO_MIGRATE=false` (not yet implemented) to disable auto-migration.

## Deployment Checklist

- [ ] Database is running (TimescaleDB/PostgreSQL with `timescaledb` extension)
- [ ] Environment variables set (`DATABASE_URL`, `JWT_SECRET`, `PORT`)
- [ ] Azure AD configured (if using SSO: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`)
- [ ] Server binary started (migrations run automatically)
- [ ] Worker deployed with config YAML pointing to the correct database
- [ ] API key created via Admin UI for CLI/LLM access
