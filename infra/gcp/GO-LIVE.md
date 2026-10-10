# Going live: shop, warehouse, database

Run these in order, in PowerShell from the repo folder (`D:\chennai rice website`).
Nothing here prints a password or key on screen.

## 1. Sign in again (both expire)

```powershell
firebase login --reauth
gcloud auth login
gcloud auth application-default login
```

## 2. Database: latest tables, products and prices, then lock the app login

```powershell
powershell -ExecutionPolicy Bypass -File infra\gcp\phase2-load.ps1
powershell -ExecutionPolicy Bypass -File infra\gcp\phase2b-harden.ps1
```

`phase2b-harden.ps1` gives the app login a **new password**, so step 3 must come after it.

## 3. Passwords for the live function (Secret Manager)

```powershell
# Database password: copied from the database project, never shown.
gcloud secrets versions access latest --secret=db-app-password --project=chennairice-website --out-file="$env:TEMP\dbpw.txt"
firebase functions:secrets:set DB_PASSWORD --project chennai-rice-website --data-file "$env:TEMP\dbpw.txt"
Remove-Item "$env:TEMP\dbpw.txt"

# support@ Gmail app password (paste it when asked).
firebase functions:secrets:set SMTP_PASS --project chennai-rice-website
```

## 4. Razorpay LIVE keys

Razorpay Dashboard → switch to **Live mode** (needs KYC approved):

1. Account & Settings → API Keys → Generate. In `functions/.env` replace
   `RAZORPAY_KEY_ID=` (starts `rzp_live_`) and `RAZORPAY_KEY_SECRET=`.
2. Account & Settings → Webhooks → Add:
   - URL `https://chennairiceindustries.com/api/payments/webhook/razorpay`
   - Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`
   - Make up a long secret, and add it to `functions/.env` as `RAZORPAY_WEBHOOK_SECRET=`.

## 5. Google sign-in for staff (Firebase console, project chennai-rice-website)

1. Authentication → Sign-in method → **Google** → Enable → support email → Save.
2. Authentication → Settings → Authorized domains → add `chennairiceindustries.com`
   and `www.chennairiceindustries.com`.

## 6. Give these to Claude

- The GSTIN (printed on every invoice).
- "Done" for steps 1–5. Claude then fills the Firebase web settings, runs the tests,
  pushes to GitHub and deploys (`firebase deploy --only hosting,functions`).

## 7. After deploy

1. Open `https://chennairiceindustries.com/warehouse` → Sign in with Google
   (ashleyjosco@ is the first owner).
2. Settings → Team: add the warehouse staff.
3. Products & Inventory: enter the **real opening stock** for every pack. Until
   then every product shows as sold out.
4. One small real order, check the emails, then refund it from the panel.
