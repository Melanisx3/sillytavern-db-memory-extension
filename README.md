# SillyTavern DB/Memory Extension — Infrastructure

Local Docker infrastructure with **PostgreSQL + pgvector** and a minimal TypeScript backend placeholder.

## Stack

| Component   | Technology              |
|-------------|------------------------|
| Database    | PostgreSQL 16 + pgvector |
| Backend     | Node.js 20 + TypeScript  |
| Orchestration | Docker Compose        |

## Project structure

```
project/
├── backend/              # TypeScript backend placeholder
├── extension/            # SillyTavern extension (not implemented yet)
├── database/
│   ├── init/             # Runs on first PostgreSQL start
│   ├── migrations/       # SQL migrations (manual apply)
│   └── scripts/          # Utility scripts
├── docker-compose.yml
├── .env
├── .env.example
└── README.md
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Git (optional)

## Quick start

### 1. Configure environment

Copy the example env file and set a strong password:

```bash
cp .env.example .env
```

Edit `.env` and replace `POSTGRES_PASSWORD` with a secure value.

### 2. Validate Compose config

```bash
docker compose config
```

### 3. Start PostgreSQL

```bash
docker compose up -d
```

This starts only PostgreSQL by default. The backend is optional (see below).

### 4. Verify pgvector

Wait until the container is healthy, then run:

```bash
docker compose exec postgres psql -U app_user -d sillytavern_memory -f /dev/stdin < database/scripts/verify-pgvector.sql
```

On Windows PowerShell:

```powershell
Get-Content database\scripts\verify-pgvector.sql | docker compose exec -T postgres psql -U app_user -d sillytavern_memory
```

Expected output includes:

- `extname = vector` with a version number
- A distance value from the vector query (e.g. `1`)

### 5. Connect manually

```bash
docker compose exec postgres psql -U app_user -d sillytavern_memory
```

Inside psql:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;
```

## Optional: start backend placeholder

The backend verifies PostgreSQL connectivity and pgvector on startup.

```bash
docker compose --profile backend up -d --build
docker compose logs backend
```

## Database initialization

On **first start**, scripts in `database/init/` run automatically:

- `01-extensions.sql` — enables `CREATE EXTENSION IF NOT EXISTS vector;`

Init scripts run only when the data volume is empty. To re-run init, remove the volume (see below).

## Migrations

Place numbered SQL files in `database/migrations/` (e.g. `001_create_memories.sql`).

Apply migrations manually:

```bash
# From host (requires psql client)
export POSTGRES_PASSWORD=your_password
./database/scripts/apply-migrations.sh
```

Or via Docker:

```bash
docker compose exec -T postgres psql -U app_user -d sillytavern_memory < database/migrations/001_example.sql
```

## Stop

Stop containers, keep data:

```bash
docker compose down
```

## Remove containers

Remove containers and network, keep volumes:

```bash
docker compose down --remove-orphans
```

## Remove volumes (delete all data)

**Warning:** this permanently deletes the PostgreSQL database.

```bash
docker compose down -v
```

Or remove the named volume directly:

```bash
docker volume rm sillytavern-memory-postgres-data
```

## Environment variables

| Variable           | Description                    | Default              |
|--------------------|--------------------------------|----------------------|
| `POSTGRES_USER`    | Application database user      | `app_user`           |
| `POSTGRES_PASSWORD`| Database password (required) | —                    |
| `POSTGRES_DB`      | Database name                  | `sillytavern_memory` |
| `POSTGRES_PORT`    | Host port mapping              | `5432`               |
| `BACKEND_PORT`     | Backend host port (optional)   | `3000`               |
| `NODE_ENV`         | Node environment (optional)    | `development`        |

All credentials are loaded from `.env` — no hardcoded passwords in Compose files.

## Troubleshooting

### Container not healthy

```bash
docker compose ps
docker compose logs postgres
```

### pgvector extension missing

Ensure the volume was created after adding init scripts. If the DB was initialized before init scripts existed:

```bash
docker compose down -v
docker compose up -d
```

Or enable manually:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Port 5432 already in use

Change `POSTGRES_PORT` in `.env` (e.g. `5433`) and restart:

```bash
docker compose down
docker compose up -d
```

## What's not included (by design)

- SillyTavern UI extension
- Memory Engine / API
- Redis, MongoDB, MySQL, Qdrant

These will be added in later phases.