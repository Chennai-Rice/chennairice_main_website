<#
  Phase 1 — Cloud SQL foundation for B2C sales.

  Builds everything the sales database needs in project `chennairice-website`:
    1.1  link billing                  1.5  database + login users
    1.2  budget alert (INR 3,000/mo)   1.6  passwords into Secret Manager
    1.3  enable APIs                   1.7  storage buckets (site files, backups)
    1.4  PostgreSQL 16 server, Mumbai  1.8  access for the website's backend

  Safe to re-run: every step checks for what already exists and skips it.
  Passwords are generated here and written straight into Secret Manager —
  they are never printed, logged or saved to disk beyond a temp file that is
  deleted immediately.

  Run from PowerShell:
      powershell -ExecutionPolicy Bypass -File infra\gcp\phase1-setup.ps1
#>

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- settings
$Gcloud          = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$DbProject       = 'chennairice-website'       # holds the database
$WebProject      = 'chennai-rice-website'      # holds the website + backend
$BillingAccount  = '0137CF-B8144B-2C8E6B'       # "My Billing Account"
$BudgetInr       = 3000
$Region          = 'asia-south1'               # Mumbai
$Instance        = 'chennairice-db'
$Tier            = 'db-g1-small'               # starting size: shared core, 1.7 GB
$Database        = 'chennairice'
$AdminUser       = 'chennairice_admin'         # migrations and maintenance
$AppUser         = 'chennairice_app'           # what the website's backend uses
$AssetsBucket    = 'chennairice-website-assets'
$BackupsBucket   = 'chennairice-website-backups'
$BackendSaName   = 'api-backend'
$BackendSa       = "$BackendSaName@$WebProject.iam.gserviceaccount.com"

# ----------------------------------------------------------------- helpers
function Step($n, $text) { Write-Host "`n=== $n  $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    ok    $text" -ForegroundColor Green }
function Skip($text)     { Write-Host "    skip  $text" -ForegroundColor DarkGray }

# Runs gcloud, returns its output, throws with the real message on failure.
function G {
  $out = & $Gcloud @args 2>&1
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ')`n$($out | Out-String)" }
  return $out
}
# Runs gcloud only to ask "does this exist?" — never throws.
function Exists {
  & $Gcloud @args *> $null
  return ($LASTEXITCODE -eq 0)
}

function New-Password {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  # URL-safe, no symbols that need escaping in a connection string
  return ([Convert]::ToBase64String($bytes) -replace '[+/=]', '').Substring(0, 30)
}

# Stores a value as a new secret version without it ever touching the screen.
function Set-Secret($name, $value) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $value)   # no trailing newline
    if (-not (Exists secrets describe $name --project=$DbProject)) {
      G secrets create $name --project=$DbProject --replication-policy=user-managed --locations=$Region --data-file=$tmp | Out-Null
    } else {
      G secrets versions add $name --project=$DbProject --data-file=$tmp | Out-Null
    }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

# --------------------------------------------------------------------- 1.1
Step '1.1' 'Link billing'
$billing = G billing projects describe $DbProject --format='value(billingEnabled)'
if ("$billing".Trim() -eq 'True') { Skip 'billing already enabled' }
else { G billing projects link $DbProject --billing-account=$BillingAccount | Out-Null; Ok "linked $BillingAccount" }

# --------------------------------------------------------------------- 1.3
# (APIs before the budget: the budget command needs the budgets API on.)
Step '1.3' 'Enable APIs'
G services enable sqladmin.googleapis.com secretmanager.googleapis.com storage.googleapis.com `
  billingbudgets.googleapis.com iam.googleapis.com --project=$DbProject | Out-Null
Ok 'Cloud SQL, Secret Manager, Storage, Budgets, IAM'

# --------------------------------------------------------------------- 1.2
Step '1.2' "Budget alert at INR $BudgetInr / month"
$budgets = G billing budgets list --billing-account=$BillingAccount --billing-project=$DbProject --format='value(displayName)'
if ($budgets -match 'Chennairice database') { Skip 'budget already exists' }
else {
  G billing budgets create --billing-account=$BillingAccount --billing-project=$DbProject `
    --display-name='Chennairice database' --budget-amount="$($BudgetInr)INR" `
    --filter-projects="projects/$DbProject" `
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 | Out-Null
  Ok 'emails at 50%, 90% and 100%'
}

# --------------------------------------------------------------------- 1.4
Step '1.4' "PostgreSQL 16 server '$Instance' in $Region"
if (Exists sql instances describe $Instance --project=$DbProject) { Skip 'instance already exists' }
else {
  Write-Host '    creating — this takes 5–10 minutes...'
  # Backups at 21:30 UTC = 03:00 IST, maintenance Sunday 21:00 UTC = Monday
  # 02:30 IST: both in the quietest hours for an Indian shop.
  # ENCRYPTED_ONLY + no authorised networks: reachable only through Google's
  # connector, never directly from the internet.
  G sql instances create $Instance --project=$DbProject `
    --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=$Tier --region=$Region `
    --storage-type=SSD --storage-size=10 --storage-auto-increase `
    --backup-start-time=21:30 --enable-point-in-time-recovery `
    --retained-backups-count=7 --retained-transaction-log-days=7 `
    --maintenance-window-day=SUN --maintenance-window-hour=21 `
    --ssl-mode=ENCRYPTED_ONLY --deletion-protection `
    --insights-config-query-insights-enabled `
    --database-flags=cloudsql.iam_authentication=on | Out-Null
  Ok 'created'
}

# --------------------------------------------------------------------- 1.5 / 1.6
Step '1.5' "Database '$Database' and users"
if (Exists sql databases describe $Database --instance=$Instance --project=$DbProject) { Skip 'database already exists' }
else { G sql databases create $Database --instance=$Instance --project=$DbProject | Out-Null; Ok 'database created' }

$existingUsers = G sql users list --instance=$Instance --project=$DbProject --format='value(name)'
foreach ($u in @(@{ name = $AdminUser; secret = 'db-admin-password' }, @{ name = $AppUser; secret = 'db-app-password' })) {
  if ($existingUsers -contains $u.name) { Skip "user $($u.name) already exists"; continue }
  $pw = New-Password
  G sql users create $u.name --instance=$Instance --project=$DbProject --password=$pw | Out-Null
  Step '1.6' "Password for $($u.name) -> Secret Manager '$($u.secret)'"
  Set-Secret $u.secret $pw
  $pw = $null
  Ok "user $($u.name) created, password stored"
}

# --------------------------------------------------------------------- 1.7
Step '1.7' 'Storage buckets'
foreach ($b in @($AssetsBucket, $BackupsBucket)) {
  if (Exists storage buckets describe "gs://$b") { Skip "gs://$b already exists"; continue }
  G storage buckets create "gs://$b" --project=$DbProject --location=$Region `
    --uniform-bucket-level-access --public-access-prevention | Out-Null
  Ok "gs://$b"
}
# Backups: move to cheaper storage after 30 days, delete after a year.
$rules = @'
{"rule":[
  {"action":{"type":"SetStorageClass","storageClass":"NEARLINE"},"condition":{"age":30}},
  {"action":{"type":"Delete"},"condition":{"age":365}}
]}
'@
$tmp = [System.IO.Path]::GetTempFileName(); [System.IO.File]::WriteAllText($tmp, $rules)
G storage buckets update "gs://$BackupsBucket" --lifecycle-file=$tmp | Out-Null
Remove-Item $tmp -Force
Ok 'backups bucket: Nearline after 30 days, deleted after 365'

# --------------------------------------------------------------------- 1.8
Step '1.8' "Backend access: $BackendSa"
if (Exists iam service-accounts describe $BackendSa --project=$WebProject) { Skip 'service account already exists' }
else {
  G iam service-accounts create $BackendSaName --project=$WebProject `
    --display-name='Website API backend' `
    --description='Runs the /api Cloud Function. Database and secret access only.' | Out-Null
  Ok 'service account created'
}
G projects add-iam-policy-binding $DbProject --member="serviceAccount:$BackendSa" `
  --role=roles/cloudsql.client --condition=None | Out-Null
Ok 'Cloud SQL client'
foreach ($s in @('db-app-password')) {
  G secrets add-iam-policy-binding $s --project=$DbProject --member="serviceAccount:$BackendSa" `
    --role=roles/secretmanager.secretAccessor | Out-Null
}
Ok 'can read the app password (not the admin one)'
G storage buckets add-iam-policy-binding "gs://$AssetsBucket" --member="serviceAccount:$BackendSa" `
  --role=roles/storage.objectAdmin | Out-Null
Ok 'can read/write site files bucket (not backups)'

# ------------------------------------------------------------------ summary
$conn = G sql instances describe $Instance --project=$DbProject --format='value(connectionName)'
Write-Host "`n=== Phase 1 complete" -ForegroundColor Green
Write-Host "    Instance connection name: $conn"
Write-Host "    Next: run infra\gcp\phase1-verify.mjs to prove a real connection works."
