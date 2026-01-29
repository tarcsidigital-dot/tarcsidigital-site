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

export async function onRequestPost(context) {
  try {
    const data = await readBody(context.request);

    // Honeypot: ha bot kitölti, csendben OK
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

    // Ajánlott: állítsd be Cloudflare-ben:
    // CONTACT_FROM = "Tarcsi Digital <hello@tarcsidigital.com>"
    // (ehhez a domainnek verifiednek kell lennie a Resendben)
    //
    // Ha nincs verified domain, a Resend "onboarding@resend.dev" sokszor működik tesztre,
    // de productionben jobb a saját domained.
    const from = context.env.CONTACT_FROM || `<onboarding@resend.dev>`;

    if (!apiKey || !to) {
      return json(
        { ok: false, error: "Server not configured (RESEND_API_KEY / CONTACT_TO missing)." },
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

    // Resend API call
    const payload = {
      from,
      to: [to],
      subject,
      replyTo: email, // válasz a felhasználónak menjen
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
      // Ez a rész MOST nagyon fontos: ebből látjuk pontosan mit kifogásol a Resend
      return json(
        {
          ok: false,
          error: "Resend send failed.",
          status: resendRes.status,
          detail: resendBodyText,
          hint:
            "Gyakori ok: CONTACT_FROM nem verified domain. Állítsd be CONTACT_FROM-ot saját verified címre, vagy nézd meg a detail-t.",
        },
        502
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "Unexpected error.", detail: String(e) }, 500);
  }
}