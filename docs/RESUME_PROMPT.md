Use the project handoff document as the source of truth:
`docs/RESUME_PROMPT.md` in the BrownCow repo:
https://github.com/dadhelpapp-svg/BrownCow/blob/main/docs/RESUME_PROMPT.md

Always read that file first and continue from its current state. Do not rehash basics.

That document is intentionally maintained as a living summary and will be updated only with necessary, high-signal information (current known-good baseline/tag/commit, env URLs/IDs, commands, contracts, and any new incidents/fixes).

If any chat context conflicts with the document, assume the document is correct and ask for confirmation before changing production.

---

# Resume Prompt (BrownCow Payroll Bot)

Continue from this exact state. Don’t rehash basics. I’m on **Windows + PowerShell**. Project is a **single-bot** payroll automation using **Telegram → Cloudflare Worker (Wrangler) → Google Apps Script Web App → Google Sheets**. Source of truth is GitHub.

---

## Current “Known Good” Baseline

- Repo: https://github.com/dadhelpapp-svg/BrownCow
- Branch: `main`

Known status:
- ✅ Telegram → Worker → Apps Script → reply is working end-to-end.
- ✅ Apps Script Drive consent completed (template copy works).

---

## Verified current production config (2026-03-15)

### Cloudflare Worker
- **Worker name:** `browncowpayrollbot`
- **Worker URL:** https://browncowpayrollbot.dadhelpapp.workers.dev
- **Wrangler tail:** `wrangler tail browncowpayrollbot --format json`

### Apps Script Web App
- **Web App /exec (single source of truth):**
  - https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec
- **Script ID (clasp):** `1J_YHPWVaQpLrNacqsWbM3DtICSbLqg_2Pjo4Dp5F_APIPlgq9fxqP9Fj`
- **IMPORTANT:** A library deployment is **not** the Web App and will not provide a working `/exec` URL.

### Payroll template
- **Template Spreadsheet ID:** `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- URL: https://docs.google.com/spreadsheets/d/1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ/edit

### Worker secrets (must exist)
Set with `wrangler secret put ...`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET` = `browncow_payroll_telegram_secret`
- `ALLOWED_CHAT_IDS` = `-5173650582`
- `APPS_SCRIPT_EXEC_URL` = `https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec`
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

### Smoke test (Apps Script via PowerShell)
- Result: `normalizedRows: 39`, `payrollRows: 5`

---

## Incident note (high-signal)

### Telegram webhook 401 unauthorized (fixed)
Symptom:
- Worker returned 401 and bot did not respond.

Cause:
- Telegram `secret_token` header did not match Worker `TELEGRAM_SECRET`.

Fix:
- Set Worker secret `TELEGRAM_SECRET` to exactly `browncow_payroll_telegram_secret`.
- Re-run Telegram `setWebhook` with `secret_token` set to the same value.

---

## Commands (must all work)

### Wrangler
- Deploy: `wrangler deploy`
- Tail logs: `wrangler tail browncowpayrollbot --format json`

### Apps Script (PowerShell)

Authorize smoke test:
- POST `/exec` body: `{ "action": "authorize" }`

PowerShell:
- `$exec = "https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec"`
- `Invoke-RestMethod -Method Post -Uri $exec -ContentType "application/json" -Body '{"action":"authorize"}'`

Create a new payroll file:
- Required JSON body:
  - `attendanceSheetUrl`
  - `payrollTemplateSpreadsheetId`
  - optional: `outputFileName`
  - optional: `payrollSheetName`

---

## Attendance parsing contract (LOCKED)

Output tab: `normalized_attendance`
Schema: `date, employee, time_in, time_out, hours`

Hours computation (LOCKED):
- If `OUT < IN`, treat as crossing midnight once.
- Max shift length: **17.00 hours** (drop pairs longer than this).
