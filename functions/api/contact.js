// functions/api/contact.js
// Cloudflare Pages Function: POST /api/contact
// Email küldés Resend API-val (fetch) + debug

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(resBody, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function readBody(request) {
  const ct = request.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    return await request.json();
  }

  const text = await request.text();

  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }

  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
}

// GET: gyors ellenőrzés
export async function onRequestGet(context) {
  const env = context?.env || {};
  return json({
    ok: true,
    method: "GET",
    env_present: {
      RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
      CONTACT_TO: Boolean(env.CONTACT_TO),
      CONTACT_FROM: Boolean(env.CONTACT_FROM),
      SITE_NAME: Boolean(env.SITE_NAME),
    },
  });
}

export async function onRequestPost(context) {
  // Debug request id, hogy könnyen megtaláld a Network-ben
  const reqId =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    const req = context.request;
    const data = await readBody(req);

    // Honeypot
    if ((data["bot-field"] || "").trim()) {
      return json({ ok: true, reqId });
    }

    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const phone = (data.phone || "").trim();
    const message = (data.message || "").trim();

    const cbRaw = (data.callback ?? "").toString().toLowerCase();
    const wantsCallback =
      cbRaw === "on" || cbRaw === "true" || cbRaw === "1" || cbRaw === "yes";

    if (!name || !email || !phone) {
      return json({ ok: false, reqId, error: "Missing required fields." }, 400);
    }

    // ENV
    const apiKey = context.env.RESEND_API_KEY;
    const to = context.env.CONTACT_TO;
    const site = context.env.SITE_NAME || "Tarcsi Digital";
    const from =
      context.env.CONTACT_FROM || "Tarcsi Digital <onboarding@resend.dev>";

    // Ha nincs konfigurálva, adjunk vissza egy nagyon egyértelmű debugot
    if (!apiKey || !to) {
      return json(
        {
          ok: false,
          reqId,
          error: "Server not configured.",
          env_present: {
            RESEND_API_KEY: Boolean(apiKey),
            CONTACT_TO: Boolean(to),
            CONTACT_FROM: Boolean(context.env.CONTACT_FROM),
            SITE_NAME: Boolean(context.env.SITE_NAME),
          },
        },
        500
      );
    }

    const subject = wantsCallback
      ? `Új érdeklődés – Visszahívást kér (${name})`
      : `Új érdeklődés – Üzenet érkezett (${name})`;

    const html = `
      <h2>Új kapcsolatfelvétel</h2>
      <p><strong>Név:</strong> ${escapeHtml(name)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
      <p><strong>Telefon:</strong> ${escapeHtml(phone)}</p>
      <p><strong>Visszahívást kér:</strong> ${wantsCallback ? "Igen" : "Nem"}</p>
      <hr/>
      <p><strong>Üzenet:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(message || "(nincs üzenet)")}</p>
      <hr/>
      <p style="color:#666;font-size:12px">Forrás: ${escapeHtml(site)} – weboldal űrlap</p>
    `.trim();

    const text = [
      "Új kapcsolatfelvétel",
      `Név: ${name}`,
      `E-mail: ${email}`,
      `Telefon: ${phone}`,
      `Visszahívást kér: ${wantsCallback ? "Igen" : "Nem"}`,
      "",
      "Üzenet:",
      message || "(nincs üzenet)",
    ].join("\n");

    const payload = {
      from, // pl: "Tarcsi Digital <hello@tarcsidigital.com>"
      to: [to],
      subject,
      reply_to: email, // ✅ Resend REST mező
      text,
      html,
    };

    let resendRes;
    try {
      resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Debug-Request-Id": reqId, // csak saját nyomkövetésre
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return json(
        {
          ok: false,
          reqId,
          error: "Resend fetch threw exception.",
          detail: String(err),
        },
        502
      );
    }

    const resendText = await resendRes.text().catch(() => "");

    // Ha a Resend nem ok, adjuk vissza nyersen a detailt (ez fogja elárulni az okot)
    if (!resendRes.ok) {
      return json(
        {
          ok: false,
          reqId,
          error: "Resend send failed.",
          resend_status: resendRes.status,
          resend_statusText: resendRes.statusText,
          resend_body: resendText,
          debug: {
            // kulcsot NEM adjuk vissza!
            from,
            to,
            site,
            payload_shape: Object.keys(payload),
            env_present: {
              RESEND_API_KEY: true,
              CONTACT_TO: true,
              CONTACT_FROM: Boolean(context.env.CONTACT_FROM),
            },
          },
        },
        502
      );
    }

    // Resend siker – ha JSON-t ad vissza, próbáljuk parseolni
    let resendJson = null;
    try {
      resendJson = resendText ? JSON.parse(resendText) : null;
    } catch {
      // hagyjuk nullon
    }

    return json({ ok: true, reqId, resend: resendJson || resendText || true });
  } catch (e) {
    return json(
      { ok: false, reqId: "unknown", error: "Unexpected error.", detail: String(e) },
      500
    );
  }
}