<#
  Phase 2 - fill the Cloud SQL database built by phase1-setup.ps1.

  Creates every table (backend/db/migrations), then loads the reference data
  the shop needs: the 11 products and their packs, the Nasiyanur plant
  location, company details, the delivery zone and the price list effective
  09-10-2026. Grants the website's own login (chennairice_app) read/write on
  the tables, but not the right to drop or alter them.

  It does NOT copy anything from the local test database: no test orders,
  sample customers, demo stock or local staff logins. The live database
  starts clean; real stock is entered by the plant.

  Before running (once per computer, each opens a browser to sign in):
      gcloud auth login
      gcloud auth application-default login

  Run from the project folder in PowerShell:
      powershell -ExecutionPolicy Bypass -File infra\gcp\phase2-load.ps1

  Safe to re-run: migrations apply once, and the loaders only add what is
  missing (prices are set to the price list each time).
#>

$ErrorActionPreference = 'Stop'

$Gcloud    = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$DbProject = 'chennairice-website'
$Instance  = 'chennairice-db'
$Database  = 'chennairice'
$AdminUser = 'chennairice_admin'
$AppUser   = 'chennairice_app'
$Root      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Step($n, $text) { Write-Host "`n=== $n  $text" -ForegroundColor Cyan }
# gcloud and npm print progress on stderr; Windows PowerShell would treat
# that as an error under ErrorActionPreference=Stop. Success is judged by the
# exit code instead (same approach as phase1-setup.ps1).
function G {
  $errFile = [System.IO.Path]::GetTempFileName()
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Gcloud @args 2> $errFile
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  $err = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
  Remove-Item $errFile -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "gcloud $($args -join ' ') failed:`n$err" }
  return $out
}
# Not named "Npm": PowerShell names are case-insensitive, so a function
# called Npm would call itself instead of npm.cmd.
function Invoke-NpmScript($script) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & npm.cmd run $script --silent
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) { throw "npm run $script failed" }
}

Step '2.1' 'Find the database server'
$state = "$(G sql instances describe $Instance --project=$DbProject --format='value(state)')".Trim()
if ($state -ne 'RUNNABLE') { throw "Instance $Instance is '$state', not RUNNABLE. Run phase1-setup.ps1 first." }
$conn = "$(G sql instances describe $Instance --project=$DbProject --format='value(connectionName)')".Trim()
Write-Host "    $conn"

Step '2.2' 'Sign in as the admin login (password read from Secret Manager, never shown)'
$password = "$(G secrets versions access latest --secret=db-admin-password --project=$DbProject)".Trim()

# Settings for backend/lib/db.js, for this PowerShell process only.
$env:CLOUD_SQL_INSTANCE = $conn
$env:DB_NAME            = $Database
$env:DB_USER            = $AdminUser
$env:DB_PASSWORD        = $password
$env:DB_APP_ROLE        = $AppUser
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$password = $null

Push-Location (Join-Path $Root 'backend')
try {
  if (-not (Test-Path node_modules)) { Step '2.3' 'Install backend packages'; & npm.cmd install --no-audit --no-fund | Out-Null }

  Step '2.4' 'Create the tables, and give the website login read/write'
  Invoke-NpmScript 'db:migrate'

  Step '2.5' 'Products, packs, plant location, company details, delivery zone'
  Invoke-NpmScript 'db:seed'

  Step '2.6' 'Price list effective 09-10-2026'
  Invoke-NpmScript 'db:prices'

  Step '2.7' 'Check the ID register'
  Invoke-NpmScript 'db:order-ids'
}
finally {
  Pop-Location
  foreach ($k in 'CLOUD_SQL_INSTANCE', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_APP_ROLE') {
    Remove-Item "Env:$k" -ErrorAction SilentlyContinue
  }
}

Write-Host "`n=== Phase 2 complete: the database is ready for the website." -ForegroundColor Green
Write-Host "    Before go-live: set the company GSTIN, and the plant enters opening stock."
