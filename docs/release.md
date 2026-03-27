# Release Guide

## Quick Release

```bash
make release
```

This builds the frontend, embeds it into the server, and cross-compiles all binaries to `dist/`.

## Output

```
dist/
├── dashboard-server-linux-amd64
├── dashboard-server-linux-arm64
├── dashboard-server-darwin-amd64
├── dashboard-server-darwin-arm64
├── dashboard-server-windows-amd64.exe
├── dashboard-cli-linux-amd64
├── dashboard-cli-linux-arm64
├── dashboard-cli-darwin-amd64
├── dashboard-cli-darwin-arm64
├── dashboard-cli-windows-amd64.exe
├── dashboard-worker-linux-amd64
├── dashboard-worker-linux-arm64
├── dashboard-worker-darwin-amd64
├── dashboard-worker-darwin-arm64
└── dashboard-worker-windows-amd64.exe
```

## Binaries

| Binary | Description | Platforms |
|--------|-------------|-----------|
| `dashboard-server` | API + embedded frontend + auto-migration | linux, darwin, windows |
| `dashboard-cli` | LLM agent CLI tool | linux, darwin, windows |
| `dashboard-worker` | Modbus data collector | linux, darwin, windows |

## Build Individual Binaries

```bash
make build-server    # bin/dashboard-server (includes frontend + migrations)
make build-cli       # bin/dashboard-cli
make build-worker    # bin/dashboard-worker
make build           # all three
```

## Docker Image

```bash
make docker-build    # builds industry-dashboard:latest
```

The image includes all 3 binaries. Default entrypoint is `dashboard-server`.

## Version Tagging

Binaries embed the git version via `-ldflags`.

```bash
./dashboard-server   # logs "dashboard-server version v1.0.0" at startup
./dashboard-cli version  # prints {"version":"v1.0.0"}
```

## GitHub Release (Manual)

1. Tag: `git tag v1.0.0 && git push origin v1.0.0`
2. Build: `make release`
3. Create release on GitHub, upload `dist/*`

## Release Package

When distributing to users, include:

```
├── dashboard-server-<platform>
├── dashboard-cli-<platform>
├── dashboard-worker-<platform>
├── docker-compose.production.yml
└── .env.example
```

See [Deploy Guide](deploy.md) | [部署指南](deploy-tw.md) for setup instructions.
