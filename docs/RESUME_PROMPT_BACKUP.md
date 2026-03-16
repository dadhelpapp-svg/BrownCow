# Resume Prompt Backup (BrownCow Payroll Bot)

This is a **backup copy** of `docs/RESUME_PROMPT.md`.

Workflow contract:
- Keep `docs/RESUME_PROMPT.md` as the active source of truth.
- Keep this file as a backup; update it **after** `docs/RESUME_PROMPT.md` is successfully updated/merged to `main`.
- PR branches may include a temporary working copy, but **do not keep extra resume prompt variants on `main`** beyond this backup.

---

This backup is intentionally conservative.

To recover: copy the verified “Known Good” endpoints/secrets section back into `docs/RESUME_PROMPT.md` via PR.

---

## Snapshot: verified production config (2026-03-15)

- Worker: https://browncowpayrollbot.dadhelpapp.workers.dev
- Apps Script /exec: https://script.google.com/macros/s/AKfycbznrsImFBQ1D9CtMCJ3fFU-IP8ReaAc9t12Q0zwOCkPtCxi-wFiwOSDQn-kt5d6JDQx/exec
- Template Spreadsheet ID: `1N3YymDFidjVc5Yjh3t4aWZ4XbJEY2x05a6lzlw8T4GQ`
- Telegram secret: `browncow_payroll_telegram_secret`
- Allowlisted chat id(s): `-5173650582`

## Incident note
- Telegram webhook 401 unauthorized was caused by `TELEGRAM_SECRET` mismatch; fixed by setting Worker `TELEGRAM_SECRET` to match the Telegram webhook `secret_token`.
