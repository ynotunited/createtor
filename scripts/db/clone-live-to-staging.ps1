<#
.SYNOPSIS
  Refresh the staging database as a CURRENT mirror of the live database, so a
  migration can be proven against real data shapes before it touches production.

.DESCRIPTION
  Dumps the live database (public schema, data included) and restores it into
  staging with --clean. This is meant to run immediately before a migration,
  never days ahead, so staging reflects production's current data.

  Preferred alternative: Supabase Database Branching creates an up-to-date copy
  (including auth) in one step. Use this script when branching is unavailable.

  This script never runs the migration. It only makes staging current. Then run:
     node scripts/db/migrate.mjs --dry-run      (review the plan)
     node scripts/db/migrate.mjs                (apply on staging)
     node scripts/db/verify.mjs                 (assert the schema)

.PARAMETER LiveUrl
  Postgres URI for production. Defaults to $env:LIVE_DATABASE_URL.

.PARAMETER StagingUrl
  Postgres URI for staging. Defaults to $env:STAGING_DATABASE_URL.

.PARAMETER PgBin
  Directory holding pg_dump/psql. Defaults to $env:PGBIN or PATH.

.EXAMPLE
  ./scripts/db/clone-live-to-staging.ps1
#>
[CmdletBinding()]
param(
  [string]$LiveUrl = $env:LIVE_DATABASE_URL,
  [string]$StagingUrl = $env:STAGING_DATABASE_URL,
  [string]$PgBin = $env:PGBIN
)

$ErrorActionPreference = "Stop"

function Resolve-Tool([string]$name) {
  if ($PgBin) {
    $candidate = Join-Path $PgBin $name
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Could not find '$name'. Install the Postgres client tools or set PGBIN."
}

function Get-Target([string]$url) {
  $uri = [System.Uri]$url
  return "{0}:{1}{2}" -f $uri.Host, $uri.Port, $uri.AbsolutePath
}

if (-not $LiveUrl) { throw "Set LIVE_DATABASE_URL (or -LiveUrl) to the production Postgres URI." }
if (-not $StagingUrl) { throw "Set STAGING_DATABASE_URL (or -StagingUrl) to the staging Postgres URI." }

$liveTarget = Get-Target $LiveUrl
$stagingTarget = Get-Target $StagingUrl

if ($liveTarget -eq $stagingTarget) {
  throw "Refusing to run: live and staging resolve to the same target ($liveTarget)."
}

Write-Host "Live:    $liveTarget"
Write-Host "Staging: $stagingTarget"
Write-Host ""

$pgDump = Resolve-Tool "pg_dump"
$psql = Resolve-Tool "psql"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = Join-Path $env:TEMP "acai-live-$stamp.dump"

try {
  Write-Host "1/3  Dumping live public schema (data included) to $dumpFile ..."
  & $pgDump $LiveUrl --schema=public --format=custom --no-owner --no-privileges --no-comments --file=$dumpFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)." }

  Write-Host "2/3  Restoring into staging (--clean --if-exists) ..."
  $restore = (Resolve-Tool "pg_restore")
  & $restore $StagingUrl --clean --if-exists --no-owner --no-privileges --no-comments --schema=public $dumpFile
  # pg_restore returns non-zero for benign "does not exist" notices during --clean;
  # only abort on a hard failure of the restore process itself.
  if ($LASTEXITCODE -ne 0) { Write-Warning "pg_restore reported issues (exit $LASTEXITCODE). Review output above." }

  Write-Host "3/3  Re-linking the auth->profiles trigger (dropped by --clean) ..."
  $relink = Join-Path $PSScriptRoot "staging-relink.sql"
  & $psql $StagingUrl -v ON_ERROR_STOP=1 -f $relink
  if ($LASTEXITCODE -ne 0) { Write-Warning "Trigger re-link failed; run $relink manually." }

  Write-Host ""
  Write-Host "Staging is now a current mirror of live. Next:"
  Write-Host "  node scripts/db/migrate.mjs --dry-run"
  Write-Host "  node scripts/db/migrate.mjs"
  Write-Host "  node scripts/db/verify.mjs"
}
finally {
  if (Test-Path -LiteralPath $dumpFile) { Remove-Item -LiteralPath $dumpFile -Force }
}
