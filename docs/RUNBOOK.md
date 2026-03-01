# Runbook

## Worker (Cloudflare)

From `worker/`:

- Deploy (dev): `wrangler deploy`
- Tail logs: `wrangler tail --format json`

Set secrets:
- `wrangler secret put TELEGRAM_BOT_TOKEN`
- `wrangler secret put TELEGRAM_SECRET`

Set vars (wrangler.toml or dashboard):
- `ALLOWED_CHAT_IDS`
- `SHEETS_INGEST_URL`
- `PAYROLL_TEMPLATE_ID` (optional; defaults to template ID in code)

## Apps Script

Recommended: use `clasp` with `apps-script/`.

- Deploy as Web App (/exec)
- Set access to Anyone with the link (or your preferred model)

## Telegram

- Set webhook to Worker URL
- Set secret token header to match `TELEGRAM_SECRET`
