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
  - https://script.google.com/macros/s/AKfycbyDfK5s3OrFW6OnqSZ7-ZfhE-drEEmZ4MWGaHD0wWjTZsRvQa7D8WlS6V-yrWRYYVhV/exec

Rollback (previous /exec):
- https://script.google.com/macros/s/AKfycbylciB9sHopkPyvyMhuxRgL6WO2LMiVRifEbCuQQ2SJlcH6-UihUR9Wdk8tK6Gm_1YG/exec

Purpose:
- Read attendance sheet (`Att.log report`)
- Copy payroll template into a **new output spreadsheet**
- Write `normalized_attendance`
- Apply time formatting (`HH:mm`) on `time_keeping`
- Generate month payroll tab (current implementation may vary by deployed code)

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
- Day header row is **contiguous** (no spacer columns) and begins at:
  - `A4:P4` = day numbers `11..26` (example run)
  - **Day columns start at A** (column A is day 11).

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

### Payroll template (format-only; copied each run)
- Name: `BrownCow Payroll - Template`
- Template Spreadsheet ID: `1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA`
- URL: https://docs.google.com/spreadsheets/d/1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA/edit

Template requirements:
- `time_keeping` tab exists
- Column A is DATE
- 13 placeholder blocks, each block is 3 columns (TIME IN, TIME OUT, TOTAL HRS)
- Block area B:AN
- Row 3: merged name blocks (B3:D3, E3:G3, ...)
- Row 4: TIME IN/TIME OUT/TOTAL HRS labels
- Data begins row 5
- Display format: TIME columns `HH:mm`, hours `0.00`

---

## Worker Secrets (must exist)

Set with `wrangler secret put ...`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET` = `browncow_payroll_telegram_secret`
- `ALLOWED_CHAT_IDS` = `-5173650582`
- `APPS_SCRIPT_EXEC_URL` = `https://script.google.com/macros/s/AKfycbyDfK5s3OrFW6OnqSZ7-ZfhE-drEEmZ4MWGaHD0wWjTZsRvQa7D8WlS6V-yrWRYYVhV/exec`
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA`

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

List deployments (to confirm current /exec):
- `cd C:\Users\user\BrownCow\apps-script`
- `clasp deployments`

Authorize smoke test (Drive consent warmup):
- POST `/exec` body: `{ "action": "authorize" }`
- PowerShell:
  - `$exec = "https://script.google.com/macros/s/AKfycbyDfK5s3OrFW6OnqSZ7-ZfhE-drEEmZ4MWGaHD0wWjTZsRvQa7D8WlS6V-yrWRYYVhV/exec"`
  - `Invoke-RestMethod -Method Post -Uri $exec -ContentType "application/json" -Body '{"action":"authorize"}'`

Create a new payroll file (copy template + write normalized_attendance):
- Required JSON body:
  - `attendanceSheetUrl` (full Google Sheets URL)
  - `payrollTemplateSpreadsheetId` (template spreadsheet ID)
  - optional: `outputFileName`

PowerShell:
- `$exec = "https://script.google.com/macros/s/AKfycbyDfK5s3OrFW6OnqSZ7-ZfhE-drEEmZ4MWGaHD0wWjTZsRvQa7D8WlS6V-yrWRYYVhV/exec"`
- `$body = @{ attendanceSheetUrl = "https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549"; payrollTemplateSpreadsheetId = "1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA"; outputFileName = "BrownCow Payroll - SmokeTest" } | ConvertTo-Json -Depth 10`
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

---

## Incident log (high-signal)

### 2026-03-04: Missing Feb 11 rows in `normalized_attendance`
Symptoms:
- Source sheet has day-11 punches in column A (e.g., `A18`, `A20`).
- Generated output had `normalizedRows = 31` and earliest date **2026-02-12** (no `2026-02-11` rows).

Cause (code-level):
- Parser paired **within each day cell only** (no cross-cell pairing), so single-token day cells produce no output.
- Employee punch row selection assumed `headerRow+1`; export has spacer rows so punch rows were missed.

Fix approach (next work):
- Change employee extraction to scan downward from header row until a row with any time tokens is found.
- Implement cross-cell stream pairing across day columns.
- Apply max shift cap (17h).

---

## Payroll rules

(Keep this section as-is; add only locked/high-signal changes.)
