# Apply all SQL migrations via the running postgres container (Windows-friendly).
# Usage: .\database\scripts\apply-migrations.ps1

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not (Test-Path ".env")) {
  throw ".env not found. Copy .env.example to .env first."
}

Get-Content ".env" | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $parts = $_.Split("=", 2)
  if ($parts.Length -eq 2) {
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
  }
}

$user = $env:POSTGRES_USER
$db = $env:POSTGRES_DB
if (-not $user -or -not $db) {
  throw "POSTGRES_USER and POSTGRES_DB must be set in .env"
}

$files = Get-ChildItem "database\migrations\*.sql" | Sort-Object Name
if (-not $files) {
  Write-Host "No migration files found."
  exit 0
}

foreach ($file in $files) {
  Write-Host "Applying migration: $($file.Name)"
  Get-Content $file.FullName -Raw | docker compose exec -T postgres psql -U $user -d $db -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed: $($file.Name)"
  }
}

Write-Host "Migrations applied successfully."
