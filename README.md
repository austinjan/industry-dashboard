# Industry Dashboard

A customizable industrial monitoring dashboard for tracking production lines, machine status, and operational metrics. Users can configure what data to monitor and how it's displayed through AI-generated dynamic layouts powered by [json-render](https://github.com/vercel-labs/json-render).

## Key Features

- **Production Line Monitoring** - Real-time visibility into production line status and throughput
- **Machine Status Tracking** - Monitor machine health, uptime, and alerts
- **Customizable Dashboards** - Users define what to monitor; AI generates the UI layout using json-render's generative UI framework
- **Role-Based Access Control (RBAC)** - Custom roles with granular permissions, scoped per site
- **Audit Trail** - Full logging of user actions and system changes for compliance and traceability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + [json-render](https://github.com/vercel-labs/json-render) (shadcn/ui components) |
| Backend | Go (chi router) |
| Database | TimescaleDB (PostgreSQL + time-series) |
| Auth | Microsoft Entra ID (Azure AD) SSO via OIDC |
| RBAC | Custom roles with permission sets, site-scoped |
| Audit | Structured audit logging |

## Getting Started

### Prerequisites
- Go 1.22+
- Node.js 18+
- Docker (for TimescaleDB)

### Setup
```bash
# Start database
make db-up

# Run migrations
make migrate

# Start backend (port 8080)
make dev

# Start frontend (port 5173, in another terminal)
cd frontend && npm install && npm run dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|------------|
| `PORT` | `8080` | Backend server port |
| `DATABASE_URL` | `postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable` | TimescaleDB connection |
| `AZURE_CLIENT_ID` | | Microsoft Entra ID app client ID |
| `AZURE_CLIENT_SECRET` | | Microsoft Entra ID app client secret |
| `AZURE_TENANT_ID` | | Azure AD tenant ID |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing secret |

## License

MIT
