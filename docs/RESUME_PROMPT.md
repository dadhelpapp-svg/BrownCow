# Resume Prompt (BrownCow Payroll Bot)

Continue from this exact state. Don’t rehash basics. I’m on **Windows + PowerShell**. Project is a **Telegram payroll bot** using **Telegram → Cloudflare Worker (Wrangler) → Google Apps Script Web App → Google Sheets**. Source of truth is GitHub.

Use the project handoff document as the source of truth:
- `docs/RESUME_PROMPT.md` in this repo.
- If any chat context conflicts with this document, assume this document is correct and ask for confirmation before changing production.

---

## Current “Known Good” Baseline

- Repo: https://github.com/dadhelpapp-svg/BrownCow
- Default branch: `main`

Recent important commits:
- `34d9a95` docs: update RESUME_PROMPT with current wiring + runbook
- `931d73d` feat(apps-script): support `{action:"authorize"}` to trigger Drive consent check via POST
- `98f747b` feat(apps-script): copy template to new payroll file and write normalized_attendance

Known reality / status:
- Cloudflare Worker is deployed and reachable.
- Telegram webhook is set and Worker receives POSTs.
- Apps Script *logic* is implemented to copy a template via Drive, but **DriveApp requires one-time interactive Google consent** in the Apps Script editor. Until granted, template copy fails.

---

## Architecture

### Telegram
- Bot: `@BrownCow_Bot`
- Group chat_id (allowlisted): `-5173650582`

Webhook security:
- Telegram header: `x-telegram-bot-api-secret-token`
- Worker validates vs `env.TELEGRAM_SECRET`
- Secret value: `browncow_payroll_telegram_secret`

### Cloudflare Worker
- Worker name: `browncowpayrollbot`
- Worker URL: https://browncowpayrollbot.dadhelpapp.workers.dev

Wrangler tail:
- `wrangler tail browncowpayrollbot --format json`

### Google Apps Script Web App
- Project: “BrownCow Payroll Bot”
- Purpose:
  - Read attendance sheet (`Att.log report`)
  - Copy payroll template into a **new output spreadsheet**
  - Write `normalized_attendance`
  - (Next) Fill `time_keeping` from `normalized_attendance` while preserving template formatting

Important: Apps Script template copy uses:
- `DriveApp.getFileById(templateId).makeCopy(outputFileName)`
This requires one-time interactive authorization.

### Google Sheets
Attendance input (user sends URL):
- Spreadsheet ID: `1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E`
- Tab: `Att.log report`
- URL: https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549

Payroll Template (format-only; copied each run):
- Template Spreadsheet ID: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- URL: https://docs.google.com/spreadsheets/d/1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ/edit?gid=1030704585#gid=1030704585

Template requirements:
- `time_keeping` tab exists
- Column A is DATE
- 13 placeholder blocks, each block is 3 columns (TIME IN, TIME OUT, TOTAL HRS)
- Block area B:AN
- Row 3: merged name blocks (B3:D3, E3:G3, …)
- Row 4: TIME IN/TIME OUT/TOTAL HRS labels
- Data begins row 5
- Display format: TIME columns `HH:mm` (military), hours `0.00`

---

## Worker Secrets (must exist)

Set with `wrangler secret put ...`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET` = `browncow_payroll_telegram_secret`
- `ALLOWED_CHAT_IDS` = `-5173650582`
- `APPS_SCRIPT_EXEC_URL` = Apps Script Web App `/exec` URL
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

---

## Commands (must all work)

### Wrangler
- Deploy: `wrangler deploy`
- Tail logs: `wrangler tail browncowpayrollbot --format json`

### Telegram webhook
- Set webhook (PowerShell):
  - `POST https://api.telegram.org/bot<token>/setWebhook` with body `{ url: <worker>, secret_token: <TELEGRAM_SECRET> }`

### Apps Script (PowerShell)
Authorize check endpoint (may still require interactive editor approval):
- `POST /exec` body: `{ "action": "authorize" }`

Create a new payroll file:
- `POST /exec` body:
  - `attendanceSheetUrl`
  - `payrollTemplateSpreadsheetId`
  - optional: `outputFileName`

---

## Contracts

### Telegram → Worker
- Incoming update must contain `message.chat.id` and `message.text` with a Google Sheets URL.

### Worker → Apps Script
- JSON payload:
  - `attendanceSheetUrl` (user-provided)
  - `payrollTemplateSpreadsheetId` (from env)
  - optional: `outputFileName`

### Apps Script → Worker
- JSON response (success):
  - `ok: true`
  - `outputSpreadsheetId`
  - `outputSpreadsheetUrl`
  - `normalizedRows`
  - `period`

---

## Attendance Parsing (locked decisions)

- Extract time tokens with regex `\d{1,2}:\d{2}` (supports concatenated punches)
- For each employee: flatten tokens left-to-right across day columns; pair sequentially:
  - token0 = IN, token1 = OUT, token2 = IN, token3 = OUT...
- Workday attribution: IN day
- Overnight: if OUT < IN, treat OUT as next day (duration adds 24h)
- `normalized_attendance` contains ONLY complete IN/OUT pairs

---

## Incidents / Fixes (important)

1) **Google Apps Script Drive authorization**
- Symptom: `You do not have permission to call DriveApp.getFileById/getRootFolder`
- Cause: Drive scope not yet approved interactively
- Fix: run a Drive-touching function once in the Apps Script editor under the deploying Google account and approve consent.

2) **Wrong /exec URL**
- Symptom: Apps Script returns old-schema errors (`outputSpreadsheetId` required)
- Fix: ensure Worker `APPS_SCRIPT_EXEC_URL` points to the deployment that matches current Code.gs.

3) **Chat allowlist mismatch**
- Symptom: Worker responds `chat_not_allowed`
- Fix: set `ALLOWED_CHAT_IDS` exactly to `-5173650582` (no quotes/brackets)

---

## Next planned work

1) Complete one-time Drive consent so template copy works.
2) Implement `time_keeping` fill from `normalized_attendance` in Apps Script (write only names + times + dates; preserve formatting).
3) Implement payroll month tab creation (e.g., `February 2026`, `(2)`, `(3)`...), compute regular/OT/ND in payroll template.
