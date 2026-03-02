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

Important commits (recent):
- `0dc87ea` docs: simplify RESUME_PROMPT to single environment and pin current exec/worker/chat/template IDs
- `931d73d` feat(apps-script): support `{action:"authorize"}`
- `98f747b` feat(apps-script): copy template into a new payroll file + write normalized_attendance

Known status / blockers:
- Worker is deployed and webhook is set.
- Apps Script Drive consent: **completed** (interactive consent granted under deployer account; Drive copy now works).

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
- Current /exec (single source of truth):
  - https://script.google.com/macros/s/AKfycbylciB9sHopkPyvyMhuxRgL6WO2LMiVRifEbCuQQ2SJlcH6-UihUR9Wdk8tK6Gm_1YG/exec

Purpose:
- Read attendance sheet (`Att.log report`)
- Copy payroll template into a **new output spreadsheet**
- Write `normalized_attendance`
- Apply time formatting (`HH:mm`) on `time_keeping`
- (Next) Fill `time_keeping` from `normalized_attendance` while preserving template formatting

Drive dependency:
- Uses `DriveApp.getFileById(templateId).makeCopy(outputFileName)`
- Requires one-time interactive authorization under the deploying Google account.

### Google Sheets
Attendance input (user sends URL):
- Spreadsheet ID: `1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E`
- Tab: `Att.log report`
- URL: https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549

Payroll Template (format-only; copied each run):
- Name: `BrownCow Payroll - Template`
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
- `APPS_SCRIPT_EXEC_URL` = `https://script.google.com/macros/s/AKfycbylciB9sHopkPyvyMhuxRgL6WO2LMiVRifEbCuQQ2SJlcH6-UihUR9Wdk8tK6Gm_1YG/exec`
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

---

## Commands (must all work)

### Wrangler
- Deploy: `wrangler deploy`
- Tail logs: `wrangler tail browncowpayrollbot --format json`

### Telegram webhook (PowerShell)
- `POST https://api.telegram.org/bot<token>/setWebhook` with body:
  - `{ url: "https://browncowpayrollbot.dadhelpapp.workers.dev", secret_token: "browncow_payroll_telegram_secret" }`

### Apps Script (PowerShell)
Authorize check endpoint (still requires interactive editor approval at least once):
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

## Payroll rules (locked decisions)

- Daily rates:
  - Default daily rate: **485.00 PHP/day**
  - `Seducon, Vhanesza L.`: **540.00 PHP/day**
- Hourly rate: `daily_rate / 8`
- Regular hours/day: **8**
- OT hours/day: `max(0, hours_worked - 8)`
- OT pay: `ot_hours * hourly_rate * ot_multiplier`
  - For now, set most employees `ot_multiplier = 1`
  - Set `Seducon, Vhanesza L.` `ot_multiplier = 1.25`
- Night differential (ND) window: **22:00–00:00**
- OT ND premium: **+6.75 PHP/hr** applied to OT hours that overlap the ND window

Rates/config source of truth:
- Add a `rates` tab in the payroll template.
- Include a `DEFAULT` row plus per-employee overrides.

Output:
- Create a new output tab named `{MonthName YYYY} Payroll` (e.g., `February 2026 Payroll`) in each generated payroll spreadsheet.

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
- Symptom: Apps Script returns old-schema errors
- Fix: ensure Worker `APPS_SCRIPT_EXEC_URL` points to the deployment that matches current Code.gs.

3) **Chat allowlist mismatch**
- Symptom: Worker responds `chat_not_allowed`
- Fix: set `ALLOWED_CHAT_IDS` exactly to `-5173650582` (no quotes/brackets)

---

## 2026-03-01 Status / last known-good run

- Apps Script Web App deployment: **Execute as: Me** (`dadhelpapp@gmail.com`)
- PowerShell smoke tests:
  - `POST {"action":"authorize"}` => `ok: true`
  - Payroll creation => `ok: true`, `normalizedRows: 39`, period `2026-02-11 ~ 2026-02-25`
- Example output spreadsheet: https://docs.google.com/spreadsheets/d/1Rpb3Vi1aG3KbzQkCTPirkTNMKb6Sj1qcZBKmDLAPOpk/edit

---

## Next planned work

1) Implement `time_keeping` fill from `normalized_attendance` in Apps Script (write only names + times + dates; preserve formatting).
2) Implement payroll month tab creation (e.g., `February 2026`, `(2)`, `(3)`...), compute regular/OT/ND in payroll template.
