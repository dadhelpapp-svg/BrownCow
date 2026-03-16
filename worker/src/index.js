/**
 * BrownCow Payroll Bot - Cloudflare Worker
 * Telegram webhook → validate → call Apps Script Web App → reply
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
  const m = String(text).match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^\s]*/);
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
    console.log("request", request.method, request.url);

    if (request.method !== "POST") return json({ ok: true });

    // Security: validate Telegram secret header
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    console.log("telegram_secret_header_present", !!secretHeader);

    if (!env.TELEGRAM_SECRET || secretHeader !== env.TELEGRAM_SECRET) {
      console.log("unauthorized_webhook", {
        hasEnvSecret: !!env.TELEGRAM_SECRET,
        headerMatches: secretHeader === env.TELEGRAM_SECRET,
      });
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    // Read body ONCE
    const bodyText = await request.text();
    console.log("telegram_body_preview", bodyText.slice(0, 200));

    const update = (() => {
      try {
        return JSON.parse(bodyText);
      } catch {
        return null;
      }
    })();

    const msg = update?.message || update?.edited_message;
    const chatId = msg?.chat?.id;
    const text = msg?.text || msg?.caption || "";

    console.log("telegram_update_parsed", { chatId, textPreview: String(text).slice(0, 80) });

    const allowed = new Set(getEnvList(env.ALLOWED_CHAT_IDS));
    const allowedHit = chatId != null && allowed.has(String(chatId));
    console.log("allowlist_check", { chatId, allowedHit, allowedCount: allowed.size });

    if (!chatId || !allowedHit) {
      return json({ ok: true, ignored: true });
    }

    const sheetUrl = extractFirstSheetsUrl(text);
    console.log("sheet_url_detected", { hasSheetUrl: !!sheetUrl });

    if (!sheetUrl) {
      await telegramApi("sendMessage", env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: "Send a Google Sheets URL (attendance sheet).",
        disable_web_page_preview: true,
      });
      return json({ ok: true });
    }

    // Resolve Apps Script URL + template ID from secrets (support old names for back-compat)
    const appsScriptExecUrl = env.APPS_SCRIPT_EXEC_URL || env.SHEETS_INGEST_URL;
    const payrollTemplateId =
      env.PAYROLL_TEMPLATE_SPREADSHEET_ID || env.PAYROLL_TEMPLATE_ID || "1szqCW-bR1VfIgoACJW27OQTecjHj4sFYyhxce8xYIsA";

    console.log("calling_apps_script", {
      hasExecUrl: !!appsScriptExecUrl,
      execUrlPreview: appsScriptExecUrl ? appsScriptExecUrl.slice(0, 60) : null,
      hasTemplateId: !!payrollTemplateId,
    });

    if (!appsScriptExecUrl) {
      await telegramApi("sendMessage", env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: "Worker misconfigured: APPS_SCRIPT_EXEC_URL is not set.",
        disable_web_page_preview: true,
      });
      return json({ ok: true, handled: "missing_exec_url" });
    }

    // Call Apps Script
    let appsResp = null;
    let appsText = "";
    try {
      const payload = {
        attendanceSheetUrl: sheetUrl,
        payrollTemplateSpreadsheetId: payrollTemplateId,
        outputFileName: null,
      };

      const r = await fetch(appsScriptExecUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      appsText = await r.text();
      console.log("apps_script_http", { status: r.status, bodyPreview: appsText.slice(0, 200) });

      try {
        appsResp = JSON.parse(appsText);
      } catch {
        appsResp = { ok: false, error: "apps_script_non_json", raw: appsText.slice(0, 500) };
      }
    } catch (err) {
      console.log("apps_script_error", String(err));
      appsResp = { ok: false, error: "apps_script_fetch_failed", detail: String(err) };
    }

    // Reply back to Telegram (always 200 to avoid retry spam)
    const reply = appsResp?.outputSpreadsheetUrl
      ? `Done. New payroll file:\n${appsResp.outputSpreadsheetUrl}`
      : `Apps Script response:\n${JSON.stringify(appsResp)}`;

    try {
      await telegramApi("sendMessage", env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: reply,
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.log("telegram_send_failed", String(err));
    }

    return json({ ok: true });
  },
};
