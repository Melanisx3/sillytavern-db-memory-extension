# SillyTavern DB/Memory Extension — Infrastructure

Local Docker infrastructure with **PostgreSQL + pgvector** and a minimal TypeScript backend placeholder.

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


## Environment variables

| Variable           | Description                    | Default              |
|--------------------|--------------------------------|----------------------|
| `POSTGRES_USER`    | Application database user      | `app_user`           |
| `POSTGRES_PASSWORD`| Database password (required) | —                    |
| `POSTGRES_DB`      | Database name                  | `sillytavern_memory` |
| `POSTGRES_PORT`    | Host port mapping              | `5432`               |
| `BACKEND_PORT`     | Backend host port (optional)   | `3000`               |
| `NODE_ENV`         | Node environment (optional)    | `development`        |
