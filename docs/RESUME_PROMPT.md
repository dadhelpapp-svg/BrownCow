# BrownCow Payroll Bot — RESUME PROMPT

## Purpose
Continue the **BrownCow Payroll Bot** build and ops work *without re-discovering context*. This project automates payroll prep from an attendance export.

**End-to-end flow (target):**
1. User posts **attendance Google Sheets URL** in a Telegram group.
2. Cloudflare Worker receives webhook, validates secret + allowed chats.
3. Worker calls Apps Script Web App (`/exec`) with JSON payload.
4. Apps Script:
   - reads `Att.log report` from the attendance sheet
   - **creates a brand-new payroll spreadsheet** by copying the Payroll Template file (preserve all formatting)
   - writes staging tab `normalized_attendance`
   - fills `time_keeping` (names + dates + times only; keep template format)
   - returns `{ outputSpreadsheetId, outputSpreadsheetUrl }`
5. Worker replies in Telegram with the newly-created payroll file URL.

---

## Current Wiring (known-good IDs)

### Cloudflare Worker
- Worker name: `browncowpayrollbot`
- URL: https://browncowpayrollbot.dadhelpapp.workers.dev

### Telegram
- Bot: `@BrownCow_Bot`
- Group chat_id (allowlisted): `-5173650582`
- Webhook secret token header: `X-Telegram-Bot-Api-Secret-Token`
- Secret value (Worker + Telegram webhook): `browncow_payroll_telegram_secret`

### Google Sheets
**Attendance input (user posts this link):**
- Spreadsheet ID: `1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E`
- Tab: `Att.log report`
- Example URL: https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit?gid=1112430549#gid=1112430549

**Payroll Template (format-only; copied each run):**
- Template Spreadsheet ID: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- Example URL: https://docs.google.com/spreadsheets/d/1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ/edit?gid=1030704585#gid=1030704585
- Required tabs:
  - `time_keeping` (fixed 13 blocks, B:AN; merged name row; row 4 labels TIME IN/TIME OUT/TOTAL)

---

## Code Repos
- BrownCow repo: https://github.com/dadhelpapp-svg/BrownCow
- Worker code lives under: `worker/` (or external local folder if not yet committed)
- Apps Script source lives under: `apps-script/`

---

## Worker Secrets (Cloudflare)
Set via `wrangler secret put ...`.

Required:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET` = `browncow_payroll_telegram_secret`
- `ALLOWED_CHAT_IDS` = `-5173650582`
- `APPS_SCRIPT_EXEC_URL` = (Apps Script Web App `/exec` URL)
- `PAYROLL_TEMPLATE_SPREADSHEET_ID` = `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

---

## Apps Script (authorization)
Apps Script uses Drive to copy the template (`DriveApp.getFileById(...).makeCopy(...)`).
This requires **one-time interactive Google consent** under the deploying Google account.

If Drive is not authorized, calls fail with:
- `You do not have permission to call DriveApp.getFileById`

Target helper endpoint (preferred):
- POST `{ "action": "authorize" }` to `/exec`

Note: Consent may still require interactive approval in the script editor at least once.

---

## Attendance Parsing Rules (locked decisions)
- Extract time tokens with regex `\d{1,2}:\d{2}` (handles concatenated punches)
- For each employee, scan day cells left-to-right; flatten tokens; pair sequentially:
  - event0 = IN, event1 = OUT, event2 = IN, event3 = OUT, ...
- Workday attribution: **IN day**
- Overnight duration: if OUT < IN, treat OUT as next day (add 24h)

`normalized_attendance` contains ONLY complete IN/OUT pairs.

---

## Timekeeping Output Template Constraints
- Column A is DATE
- 13 employee placeholder blocks (each 3 columns):
  - TIME IN, TIME OUT, TOTAL HRS
- Block area: B:AN
- Row 3: merged name blocks (B3:D3, E3:G3, ...)
- Row 4: TIME IN / TIME OUT / TOTAL HRS labels
- Data starts row 5

Formatting:
- TIME IN/OUT display: `HH:mm`
- TOTAL HRS display: `0.00`

---

## Operational Commands (PowerShell)

### Wrangler
- Deploy: `wrangler deploy`
- Tail logs: `wrangler tail browncowpayrollbot --format json`

### Telegram webhook
Set webhook with secret token:
- `https://api.telegram.org/bot<token>/setWebhook` payload `{ url, secret_token }`

---

## Next Work Items
1. Ensure Apps Script deployment used by Worker is the correct one and Drive is authorized.
2. Implement `time_keeping` fill from `normalized_attendance` in Apps Script (preserve formatting).
3. Add payroll month tab generation (e.g., `February 2026`, `(2)`, `(3)` if exists) and hour/OT/ND computations.
4. Add robustness: new hires/removed employees handling + auto-hide unused blocks.
