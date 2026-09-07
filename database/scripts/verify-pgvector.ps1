# Verify pgvector extension via Docker Compose (Windows PowerShell)

$ErrorActionPreference = "Stop"

$sql = Get-Content -Path "$PSScriptRoot\verify-pgvector.sql" -Raw
$sql | docker compose exec -T postgres psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
