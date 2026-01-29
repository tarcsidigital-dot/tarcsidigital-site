// /functions/api/contact.js
// Cloudflare Pages Function: POST /api/contact
// Email küldés MailChannels-szel (Workers/Pages kompatibilis)

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
  if (ct.includes("application/json")) {
    return await request.json();
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  // fallback
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
}

export async function onRequestPost(context) {
  try {
    const data = await readBody(context.request);

    // Honeypot (ha bot kitölti, csendben OK-t adunk vissza)
    if ((data["bot-field"] || "").trim()) {
      return json({ ok: true });
    }

    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const phone = (data.phone || "").trim();
    const message = (data.message || "").trim();

    // callback lehet: "on" / "off" / "true" / "false" stb.
    const cbRaw = (data.callback ?? "").toString().toLowerCase();
    const wantsCallback = cbRaw === "on" || cbRaw === "true" || cbRaw === "1" || cbRaw === "yes";

    // Minimális szerver oldali ellenőrzés (a kliens már validál)
    if (!name || !email || !phone) {
      return json({ ok: false, error: "Missing required fields." }, 400);
    }

    const to = context.env.CONTACT_TO;      // pl: hello@tarcsidigital.com
    const from = context.env.CONTACT_FROM;  // pl: no-reply@tarcsidigital.com  (vagy hello@...)
    const site = context.env.SITE_NAME || "Tarcsi Digital";

    if (!to || !from) {
      return json({ ok: false, error: "Server not configured (CONTACT_TO/CONTACT_FROM missing)." }, 500);
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

    // MailChannels API
    const mcRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: site },
        reply_to: { email, name },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });

    if (!mcRes.ok) {
      const errText = await mcRes.text().catch(() => "");
      return json({ ok: false, error: "Mail send failed.", detail: errText }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "Unexpected error." }, 500);
  }
}