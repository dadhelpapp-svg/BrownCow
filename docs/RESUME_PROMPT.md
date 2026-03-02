# Resume Prompt (BrownCow Payroll Bot)

Continue from this exact state. Don’t rehash basics. I’m on **Windows + PowerShell**.

Project: A **Telegram payroll bot** using:

- Telegram → Cloudflare Worker (Wrangler) → Google Apps Script Web App → Google Sheets
- Source of truth is GitHub.

---

## Current “Known Good” Baseline

### Repos
- BrownCow repo: https://github.com/dadhelpapp-svg/BrownCow

### Sheets involved
**Attendance input (read-only / cannot change):**
- Spreadsheet: `1_report`
- URL: https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit
- Tab: `Att.log report`
- Period header looks like: `YYYY-MM-DD ~ YYYY-MM-DD`
- Day header row begins with: `11 12 13 ...` (day-of-month numbers)

**Payroll output (created per run):**
- Example output spreadsheet (current working sandbox):
  - https://docs.google.com/spreadsheets/d/1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ/edit
- Tabs:
  - `time_keeping`
  - `normalized_attendance`

**Payroll template (copied per run):**
- Template spreadsheet ID: `1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA`
- URL: https://docs.google.com/spreadsheets/d/1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA/edit

---

## Telegram
- Bot: `@BrownCow_Bot`
- Group title: `BrownCow Payroll`
- Group chat_id: `-5173650582`

---

## Canonical time_keeping layout (fixed placeholders)

We use a fixed 13-slot placeholder layout and hide/unhide blocks as needed.

- Row 3: employee names (merged per block)
  - Block #1 name cell is merged `B3:D3` (write to `B3`)
  - Block #2 name cell is merged `E3:G3` (write to `E3`)
  - …
- Row 4: headers
  - `A4` = DATE
  - For each block: `TIME IN`, `TIME OUT`, `TOTAL HRS`
- Row 5+: date rows

Blocks are fixed:
- Block 1 columns: `B:C:D`
- Block 2 columns: `E:F:G`
- Block 3 columns: `H:I:J`
- …
- Block 13 ends at `AN`

Rules:
- Workday attribution: **workday = IN day**
- Overnight duration: if OUT < IN, treat OUT as next day
- Duplicates (same employee + same date in staging): write `MULTI` as TIME IN and blank TIME OUT

Number formats (military time):
- TIME IN / TIME OUT columns: `HH:mm`
- TOTAL HRS columns: `0.00`

---

## normalized_attendance (staging tab)

Tab: `normalized_attendance`

Schema (header row):
- `date` (yyyy-mm-dd)
- `employee`
- `time_in` (HH:mm)
- `time_out` (HH:mm)
- `hours` (decimal, 2dp)

Policy:
- Contains **ONLY** complete IN/OUT pairs.

---

## Parsing rules (Att.log report → normalized_attendance)

- Treat each employee’s punches as a left-to-right stream across day columns.
- Extract time tokens using regex `\d{1,2}:\d{2}` from each day cell.
- Pair sequentially: event0=IN, event1=OUT, event2=IN, event3=OUT, …
- Attribute each pair to the **IN day**.
- If the last IN is unmatched, drop it.
- Date mapping uses the `YYYY-MM-DD ~ YYYY-MM-DD` header as truth, plus **+1 day**.

---

## Apps Script Web App

### Local workflow (PowerShell)
- `git pull`
- `clasp push`
- Deploy → **New version**

### Endpoint inputs
POST JSON:
- `attendanceSheetUrl` (full sheet URL)
- `outputSpreadsheetId` (where to write `normalized_attendance` and format `time_keeping`)

Example payload:
- attendanceSheetUrl: `https://docs.google.com/spreadsheets/d/1qSFdNVqtBTat1PzMEkgiPKvvh3BiEdXq1RJurOLg74E/edit`
- outputSpreadsheetId: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`

Known working deployment (example only; may rotate):
- /exec URL: (user-created in Apps Script UI)

Important:
- `/exec` runs the **deployed version**, not your latest `clasp push` unless you redeploy.

---

## What’s next to implement

1) Worker wiring (Telegram webhook → Apps Script /exec)
2) Create a new payroll spreadsheet per run by copying template tabs
3) Fill `time_keeping` from `normalized_attendance`
4) Hide unused placeholder blocks; hide removed employees
5) Create month payroll tab (e.g., `February 2026`, with `(2)`, `(3)` if exists)
6) Hours: regular/OT split, ND hours (22:00–06:00) + Seducon ND rules

