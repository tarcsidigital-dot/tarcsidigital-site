// functions/api/contact.js
// Cloudflare Pages Function: POST /api/contact
// Email küldés Resend API-val (fetch)

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(resBody, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readBody(request) {
  const ct = request.headers.get("content-type") || "";

  // JSON
  if (ct.includes("application/json")) {
    return await request.json();
  }

  // URL-encoded / fallback
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

// (opcionális, de hasznos) gyors ellenőrzésre:
// ha megnyitod böngészőben: /api/contact -> "ok: true"
export async function onRequestGet() {
  return json({ ok: true, method: "GET" });
}

export async function onRequestPost(context) {
  try {
    const data = await readBody(context.request);

    // Honeypot
    if ((data["bot-field"] || "").trim()) {
      return json({ ok: true });
    }

    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const phone = (data.phone || "").trim();
    const message = (data.message || "").trim();

    const cbRaw = (data.callback ?? "").toString().toLowerCase();
    const wantsCallback =
      cbRaw === "on" || cbRaw === "true" || cbRaw === "1" || cbRaw === "yes";

    if (!name || !email || !phone) {
      return json({ ok: false, error: "Missing required fields." }, 400);
    }

    // ENV
    const apiKey = context.env.RESEND_API_KEY;
    const to = context.env.CONTACT_TO;
    const site = context.env.SITE_NAME || "Tarcsi Digital";

    // FONTOS:
    // CONTACT_FROM legyen pl: "Tarcsi Digital <hello@tarcsidigital.com>"
    // (verified domain kell hozzá, nálad már verified)
    const from =
      context.env.CONTACT_FROM || "Tarcsi Digital <onboarding@resend.dev>";

    if (!apiKey || !to) {
      return json(
        {
          ok: false,
          error: "Server not configured (RESEND_API_KEY / CONTACT_TO missing).",
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

    // Resend API payload (helyes mezőnevekkel!)
    const payload = {
      from,
      to: [to],
      subject,
      reply_to: email, // ✅ ez a helyes mező (nem replyTo)
      text,
      html,
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resendBodyText = await resendRes.text().catch(() => "");

    if (!resendRes.ok) {
      return json(
        {
          ok: false,
          error: "Resend send failed.",
          status: resendRes.status,
          detail: resendBodyText, // ✅ ezt majd a kliensen is nézzük meg
          hint:
            "Tipikus ok: CONTACT_FROM nincs jól beállítva / nincs verified / rossz formátum. Nézd meg a detail-t.",
        },
        502
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "Unexpected error.", detail: String(e) }, 500);
  }
}