# Sales Daddy CRM — how the website connects

Everything the website learns about a customer is saved in our own database
(Cloud SQL) first and then sent to Sales Daddy (app.salesdaddy.in), so the
sales team works every lead in one place. Code: `backend/lib/crm.js`,
`backend/lib/askeva-inbound.js`.

```
Website forms / shop / AskEva WhatsApp ──▶ Cloud SQL (crm_outbox, whatsapp_contacts)
                                           │  sent at once; retried every 10 min (salesJobs)
                                           ▼
                                  Sales Daddy (lead + note + stage)
```

## What reaches Sales Daddy

| On the website | Source | Stage | Note on the lead |
|---|---|---|---|
| Contest sign-up popup, from an **Instagram** ad | instagram | Signed up – not bought | name, campaign / ad, OTP verified |
| … from a **Facebook** ad | facebook | Signed up – not bought | same |
| … from a **Google** ad | website | Signed up – not bought | same |
| … from a **WhatsApp link** (`?utm_source=whatsapp`) | whatsapp | Signed up – not bought | same |
| Contact form | website | New | the message |
| Bulk order form (and Distributorship) | website | New | buyer type, GSTIN, quantity, message |
| Message to the business WhatsApp (AskEva webhook) | whatsapp | New | the message (at most one note a day) |
| Pressed Pay, not paid in 30 min | website | Checkout not paid | order, items, "Worth a call" |
| **Order paid** | website | **Converted** (won), value = order amount | order, items, ship-to, payment (gateway, method, UPI id / bank / card, payment ID, bank ref, paid at) |
| Confirmed / packed / dispatched / delivered / cancelled / returned | — | (unchanged) | one note per step; dispatch has courier, AWB/LR, vehicle |

Rules:

- **One lead per mobile number** (Sales Daddy matches on it). A returning
  customer's new enquiry, sign-up or order goes on the same lead as a note.
- **Stages only move forward**: New → Signed up – not bought → Checkout not
  paid → Converted. The website never moves a lead out of a stage the team set
  (Contacted, Follow-up, Lost…). A repeat buyer stays Converted.
- **No tags** are sent (stages tell the kinds apart; Source tells the channel).
- Sales Daddy refuses its own users' numbers (`own_number_not_allowed`) — test
  with other numbers.
- Sign-up ↔ purchase are matched by **mobile number** only.

## Payment on the lead

A paid order also writes its payment into the lead's **custom fields** (the
latest paid order wins; earlier orders stay in the notes): `last_order_no`,
`last_order_amount`, `payment_gateway`, `payment_method`, `payment_via`
(UPI id, bank, wallet or card ••last4), `razorpay_order_id` (Razorpay
`order_…`; `zoho_session_id` instead for a Zoho Payments order), `payment_id` (Razorpay `pay_…`),
`payment_bank_ref` (RRN) and `paid_at`. Other custom fields on the lead are
kept. To show them as named fields, create custom fields with these keys in
Sales Daddy (Settings → Custom fields).

## Set up in Sales Daddy (Settings → Pipelines & stages)

Main pipeline, in this order — the website finds stages **by name**:

1. **New** (default)
2. **Signed up – not bought** — name must start with "Signed up"
3. **Checkout not paid** — name must start with "Checkout not paid"
4. Contacted · Follow-up · Quotation Sent (used by the team)
5. **Converted** (stage class *won*)
6. Not Interested · Lost

Sources used: `website`, `instagram`, `facebook`, `whatsapp` (Sales Daddy's own).
Renaming a stage: keep the start of the name above, or change `CRM_STAGES` in
`backend/lib/crm.js`. Stage ids are re-read every 10 minutes.

## Secrets (Firebase / Secret Manager, project chennai-rice-website)

| Secret | What |
|---|---|
| `SALESDADDY_API_KEY` | Sales Daddy Developer API key (`sd_live_…`, Leads scope). The key's user must be able to close deals (Company Admin) for the Converted stage. |
| `ASKEVA_TOKEN` | AskEva API token — WhatsApp "order placed" message |
| `ASKEVA_WEBHOOK_KEY` | Secret AskEva sends in the `X-API-Key` header of the webhook |

Set with `firebase functions:secrets:set NAME --project chennai-rice-website`,
then deploy functions (keys are read at deploy).

## AskEva → website webhook

AskEva → Settings → API Settings → **Webhook Message Configurations**:

- Webhook URL: `https://chennairiceindustries.com/api/askeva/webhook`
- Header: `X-API-Key` = the `ASKEVA_WEBHOOK_KEY` value
- AskEva's **Test Run** sample (John Doe, +1 555…) is accepted but not saved.

Raw webhook calls are kept 90 days in `askeva_events`; contacts in
`whatsapp_contacts`.

## Checking it

- Queue: `select kind, status, last_error from crm_outbox order by created_at desc`
  — `failed` with `own_number_not_allowed` is expected for team numbers.
- Tests: `npm test` in `backend` (fake Sales Daddy covers leads, notes, stages,
  repeat customers, retries, AskEva).
