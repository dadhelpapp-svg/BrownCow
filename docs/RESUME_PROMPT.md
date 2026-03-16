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
- `98f747b` feat(apps-script): copy template into a new payroll file + write `normalized_attendance`

Known status / blockers:
- Worker is deployed and webhook is set.
- Apps Script Drive consent: **completed** (interactive consent granted under deployer account; Drive copy now works).

---

## Architecture

## Local workspace (Windows)

Single workspace root (source of truth): `C:\Users\user\BrownCow`

- Repo working copy (GitHub): `C:\Users\user\BrownCow`
- Apps Script (clasp project): `C:\Users\user\BrownCow\apps-script`
  - Key files: `.clasp.json`, `appsscript.json`, `Code.gs`
- Cloudflare Worker (Wrangler project): `C:\Users\user\BrownCow\worker`
- Removed (duplicate / deprecated):
  - `C:\Users\user\browncowpayrollbot`
  - `C:\Users\user\browncow-clasp-work`

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
- Current `/exec` (single source of truth):
  - https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec
  - Note: A library deployment (e.g., “v49”) is **not** the Web App and will not provide a working `/exec` URL.

Purpose:
- Read attendance sheet (`Att.log report`)
- Copy payroll template into a **new output spreadsheet**
- Write `normalized_attendance`
- Write payroll totals into `payrollSheetName` (e.g. "February 2026 Payroll")

Drive dependency:
- Uses `DriveApp.getFileById(templateId).makeCopy(outputFileName)`
- Requires one-time interactive authorization under the deploying Google account

---

## Google Sheets

### Attendance input (user sends URL)
- Spreadsheet ID: `1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E`
- Tab: `Att.log report`
- URL: https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549

#### VERIFIED export mapping (do not guess)
This is a fingerprint machine export and **cannot be changed**. The bot must parse it as-is.

- Period string is on row 3 and looks like: `YYYY-MM-DD ~ YYYY-MM-DD`.
- Day header row is **contiguous** (no spacer columns). Do not assume it starts at 11.

Employee block detection:
- Employee header rows have `A = "ID:"`.
- Punch data row is **not guaranteed** to be `headerRow + 1` (there can be blank spacer rows).
  - Required logic: from an `ID:` header row, scan downward until the first row that contains any time tokens in day columns.

Cell content format:
- Punch cells may contain concatenated tokens (not newline-separated), e.g.:
  - `11:2518:30`
  - `00:0011:0019:05`
- Always extract tokens via regex: `\d{1,2}:\d{2}` (then normalize to `HH:mm`).
- `00:00` is **real midnight** (12:00am next day), not a placeholder.

### Payroll template (copied each run)
- Template Spreadsheet ID: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- URL: https://docs.google.com/spreadsheets/d/1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ/edit

---

## Worker Secrets (must exist)

Set with `wrangler secret put ...`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET` = `browncow_payroll_telegram_secret`
- `ALLOWED_CHAT_IDS` = `-5173650582`
- `APPS_SCRIPT_EXEC_URL` = `https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec`
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

---

## Commands (must all work)

### Wrangler
- Deploy: `wrangler deploy`
- Tail logs: `wrangler tail browncowpayrollbot --format json`

### Apps Script (PowerShell)

Deploy code (clasp):
- `cd C:\Users\user\BrownCow\apps-script`
- `clasp push`
- `clasp deploy -d "..."`

Authorize smoke test (Drive consent warmup):
- POST `/exec` body: `{ "action": "authorize" }`
- PowerShell:
  - `$exec = "https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec"`
  - `Invoke-RestMethod -Method Post -Uri $exec -ContentType "application/json" -Body '{"action":"authorize"}'`

Create a new payroll file (copy template + write normalized_attendance + payroll totals):
- Required JSON body:
  - `attendanceSheetUrl` (full Google Sheets URL)
  - `payrollTemplateSpreadsheetId` (template spreadsheet ID)
  - optional: `outputFileName`
  - optional: `payrollSheetName` (defaults to "{Month} {Year} Payroll")

PowerShell:
- `$exec = "https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec"`
- `$body = @{ attendanceSheetUrl = "https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549"; payrollTemplateSpreadsheetId = "1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ"; outputFileName = "BrownCow Payroll - SmokeTest"; payrollSheetName = "February 2026 Payroll" } | ConvertTo-Json -Depth 10`
- `Invoke-RestMethod -Method Post -Uri $exec -ContentType "application/json" -Body $body`

---

## Attendance parsing contract (LOCKED)

Output tab: `normalized_attendance`
Schema: `date, employee, time_in, time_out, hours`

Parsing rules:
- Read day cells **left-to-right** across the day columns.
- Extract all time tokens in order via regex from each cell (tokens are often concatenated).
- Build a single event stream per employee: sequence of `{date, time}`.
- Pair sequentially across cells:
  - first token = IN
  - next token = OUT
  - repeat
  - If odd number of tokens, drop the final unmatched IN.
- Row date is always the **IN date** (the day column where the IN token appears).

Hours computation (LOCKED):
- Only count actual hours within a 0–24h span.
- If `OUT < IN`, treat as crossing midnight once:
  - Example: `16:00 → 00:50` = `8.83` hours (8h50m)
  - Example: `16:00 → 00:00` = `8.00`
- Max shift length: **17.00 hours** (drop pairs longer than this).
