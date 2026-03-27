[English](deploy.md) | [繁體中文](deploy-tw.md)

# Deploy Guide

## Prerequisites

- A server (Linux, macOS, or Windows)
- TimescaleDB (PostgreSQL with time-series extension)
- The release binaries (see [Release Guide](release.md))

## Option 1: Docker Compose (Recommended)

The simplest way. Includes TimescaleDB — no separate database setup needed.

### Step 1: Prepare files

You need 3 files from the release:

```
├── docker-compose.production.yml
├── .env.example
└── dashboard-server image (or Dockerfile)
```

### Step 2: Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required — change these
DB_PASSWORD=your-secure-password
JWT_SECRET=your-random-secret-string

# Optional
DB_USER=dashboard
DB_NAME=industry_dashboard
DB_PORT=5432
PORT=8080

# Azure AD SSO (leave empty for dev login)
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
```

### Step 3: Start

```bash
docker compose -f docker-compose.production.yml up -d
```

The server will:
1. Wait for the database to be healthy
2. Run all database migrations automatically
3. Start serving on `http://your-server:8080`

### Step 4: Verify

```bash
curl http://localhost:8080/healthz
# Should return: OK
```

Open `http://your-server:8080` in a browser.

### Managing

```bash
# View logs
docker compose -f docker-compose.production.yml logs -f server

# Restart
docker compose -f docker-compose.production.yml restart server

# Stop
docker compose -f docker-compose.production.yml down

# Update (after new release)
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

## Option 2: Binary + External Database

For when you have an existing PostgreSQL/TimescaleDB instance.

### Step 1: Prepare database

Ensure your PostgreSQL has the TimescaleDB extension:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Step 2: Run server

```bash
DATABASE_URL="postgres://user:password@db-host:5432/industry_dashboard?sslmode=require" \
JWT_SECRET="your-random-secret" \
PORT=8080 \
./dashboard-server
```

Migrations run automatically on startup. Your existing data is safe — only new migrations are applied.

### Step 3: Run as a system service (Linux)

Create `/etc/systemd/system/dashboard.service`:

```ini
[Unit]
Description=Industry Dashboard
After=network.target

[Service]
Type=simple
User=dashboard
EnvironmentFile=/etc/dashboard/.env
ExecStart=/usr/local/bin/dashboard-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

## Deploying the Worker

The worker runs on factory edge devices, connecting to machines via Modbus TCP and sending data to the database.

### Step 1: Copy binary

Copy `dashboard-worker` to the edge device.

### Step 2: Create config

Create `/etc/dashboard/worker.yaml`:

```yaml
site_code: "FACTORY-01"
site_name: "Factory Floor 1"
timezone: "Asia/Taipei"
poll_interval: 5s

lines:
  - name: "Assembly Line 1"
    display_order: 1
    machines:
      - name: "CNC-01"
        model: "Haas VF-2"
        connection:
          host: "192.168.1.101"
          port: 502
          slave_id: 1
        registers:
          - name: temperature
            address: 40001
            type: holding
            data_type: float32
            unit: "°C"
```

### Step 3: Run

```bash
DATABASE_URL="postgres://user:password@db-host:5432/industry_dashboard?sslmode=require" \
./dashboard-worker -config /etc/dashboard/worker.yaml
```

## Setting Up the CLI

The CLI lets LLM agents query the dashboard.

### Step 1: Create API key

In the dashboard UI: **Admin > API Keys > Create Key**. Copy the `dk_...` key.

### Step 2: Configure CLI

```bash
./dashboard-cli configure --url http://your-server:8080 --api-key dk_YOUR_KEY
```

### Step 3: Test

```bash
./dashboard-cli sites
./dashboard-cli alerts --site YOUR_SITE_CODE --status open
```

### Step 4: Install as agent skill (optional)

```bash
./dashboard-cli inject-skill claude-code --global
```

## Architecture Overview

```
                    ┌──────────────┐
                    │   Browser    │
                    └──────┬───────┘
                           │ :8080
                    ┌──────┴───────┐
                    │   Server     │
                    │ (API + SPA)  │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │ TimescaleDB  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────┴──┐  ┌──────┴──┐  ┌──────┴──┐
       │ Worker  │  │ Worker  │  │  CLI /   │
       │ (edge)  │  │ (edge)  │  │  LLM     │
       └─────────┘  └─────────┘  └─────────┘
```

## Deployment Checklist

- [ ] Database running (TimescaleDB/PostgreSQL)
- [ ] `DB_PASSWORD` and `JWT_SECRET` set
- [ ] Server started (migrations auto-apply)
- [ ] Dashboard accessible at `http://server:8080`
- [ ] Azure AD configured (if using SSO)
- [ ] Worker deployed with config YAML
- [ ] API key created for CLI/LLM access
- [ ] Backups configured for database volume

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server can't connect to DB | Check `DATABASE_URL`, ensure DB is running and accepting connections |
| Migration failed | Check server logs. If `dirty` migration, fix manually in `schema_migrations` table |
| Frontend shows blank page | Ensure server was built with `make build-server` (not just `go build`) |
| CLI returns "unauthorized" | Check API key is active in Admin > API Keys |
| Worker not collecting data | Check Modbus connection settings in worker YAML, verify machine is reachable |
