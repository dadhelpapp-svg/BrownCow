/**
 * BrownCow Payroll Bot - Cloudflare Worker
 * Telegram webhook → validate → call Apps Script → reply
 */

function json(res, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function getEnvList(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractFirstSheetsUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+[^\s]*/);
  return m ? m[0] : null;
}

async function telegramApi(method, token, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    const msg = data?.description || `Telegram API error (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ ok: true });

    // Security: validate Telegram secret header
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!env.TELEGRAM_SECRET || secret !== env.TELEGRAM_SECRET) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const update = await request.json().catch(() => null);
    const msg = update?.message || update?.edited_message;
    const chatId = msg?.chat?.id;
    const text = msg?.text || msg?.caption || "";

    const allowed = new Set(getEnvList(env.ALLOWED_CHAT_IDS));
    if (!chatId || !allowed.has(String(chatId))) {
      return json({ ok: true, ignored: true });
    }

    const sheetUrl = extractFirstSheetsUrl(text);
    if (!sheetUrl) {
      await telegramApi("sendMessage", env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: "Send a Google Sheets URL (attendance sheet).",
        disable_web_page_preview: true,
      });
      return json({ ok: true });
    }

    // Call Apps Script
    const payload = {
      attendanceSheetUrl: sheetUrl,
      payrollTemplateSpreadsheetId: env.PAYROLL_TEMPLATE_ID || "1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA",
      monthName: null, // Apps Script can derive from attendance period
      timeFormat: "24h",
      workdayRule: "IN_DAY",
    };

    const r = await fetch(env.SHEETS_INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));
    const reply = data?.spreadsheetUrl
      ? `Created payroll file:\n${data.spreadsheetUrl}`
      : `Apps Script response:\n${JSON.stringify(data)}`;

    await telegramApi("sendMessage", env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: reply,
      disable_web_page_preview: true,
    });

    return json({ ok: true });
  },
};
