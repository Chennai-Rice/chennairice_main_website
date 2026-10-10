<#
  Phase 2b - make the website's database login a plain data login.

  Logins made by gcloud join Cloud SQL's cloudsqlsuperuser group, which
  through the database's public schema can drop tables. This replaces
  chennairice_app with a login made in SQL, outside that group, with a new
  password stored straight into Secret Manager (never shown), and proves it
  can read and write but cannot drop, alter or create anything.

  Run from the project folder, right after signing in:
      gcloud auth application-default login
      powershell -ExecutionPolicy Bypass -File infra\gcp\phase2b-harden.ps1
#>

$ErrorActionPreference = 'Stop'
$Gcloud    = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$DbProject = 'chennairice-website'
$Instance  = 'chennairice-db'
$AppUser   = 'chennairice_app'
$Root      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Step($n, $text) { Write-Host "`n=== $n  $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    ok    $text" -ForegroundColor Green }
# gcloud prints progress on stderr; judge success by exit code only.
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
function New-Password {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace '[+/=]', '').Substring(0, 30)
}

function Invoke-Harden {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & node (Join-Path $Root 'infra\gcp\harden-app-login.mjs') @args
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) { throw 'hardening step failed (see above)' }
}

Step '2b.1' "Remove the gcloud-made $AppUser (it belongs to cloudsqlsuperuser)"
$users = G sql users list --instance=$Instance --project=$DbProject --format='value(name)'
if ($users -contains $AppUser) {
  # The migration granted it read/write; PostgreSQL will not delete a login
  # that still holds rights, so take them back first (re-granted in 2b.3).
  $env:ADMIN_PASSWORD = "$(G secrets versions access latest --secret=db-admin-password --project=$DbProject)".Trim()
  try { Invoke-Harden --release } finally { Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue }
  G sql users delete $AppUser --instance=$Instance --project=$DbProject --quiet | Out-Null
  Ok 'removed'
} else { Ok 'already removed' }

Step '2b.2' 'New password -> Secret Manager db-app-password (never shown)'
$appPassword = New-Password
$tmp = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($tmp, $appPassword)
  G secrets versions add db-app-password --project=$DbProject --data-file=$tmp | Out-Null
} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
Ok 'stored as a new version'

Step '2b.3' "Recreate $AppUser in SQL with data-only rights, then prove it"
$env:ADMIN_PASSWORD = "$(G secrets versions access latest --secret=db-admin-password --project=$DbProject)".Trim()
$env:APP_PASSWORD = $appPassword
$appPassword = $null
try {
  Invoke-Harden
} finally {
  Remove-Item Env:ADMIN_PASSWORD, Env:APP_PASSWORD -ErrorAction SilentlyContinue
}

# Older versions of the app password are now useless; disable them.
$versions = G secrets versions list db-app-password --project=$DbProject --filter='state=ENABLED' --format='value(name)' --sort-by='~createTime'
$versions | Select-Object -Skip 1 | ForEach-Object {
  G secrets versions disable $_ --secret=db-app-password --project=$DbProject | Out-Null
}
Ok 'old app password versions disabled'

Write-Host "`n=== Phase 2b complete: the website login can read and write data, nothing more." -ForegroundColor Green
