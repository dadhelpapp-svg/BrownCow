# Architecture

Telegram → Cloudflare Worker → Apps Script Web App → Google Sheets

## Telegram
- Bot username: @BrownCow_Bot
- Group chat_id (BrownCow Payroll): -5173650582

## Cloudflare Worker
- Receives Telegram webhook updates
- Verifies `x-telegram-bot-api-secret-token`
- Restricts to allowed chat IDs
- Extracts Google Sheets URL from message text
- Calls Apps Script `/exec` with JSON payload
- Replies to Telegram with status + created payroll spreadsheet URL

## Apps Script Web App
- Receives JSON payload
- Reads attendance spreadsheet (Att.log report)
- Creates a new payroll spreadsheet by copying template tabs
- Writes `time_keeping` grid using left-to-right time token pairing (workday = IN day)
- Creates/renames payroll tab to Month Year

## Google Sheets
- Attendance input: user-provided URL
- Payroll template: 1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA
