# Resume Prompt (BrownCow Payroll Bot)

Continue from this exact state. Don’t rehash basics. I’m on Windows + PowerShell.

Project: Telegram payroll bot using Telegram → Cloudflare Worker → Google Apps Script Web App → Google Sheets.

## Known IDs
- Telegram bot: @BrownCow_Bot
- Telegram group chat_id: -5173650582
- Payroll template spreadsheet: 1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA

## Current behavior
- Bot receives an attendance Google Sheets URL
- Script creates a new payroll spreadsheet each run
- Copies payroll template tabs
- Writes time_keeping using left-to-right time token pairing (workday = IN day)

## Next to implement
- Apps Script parsing + writing
- Payroll calculations tab population
