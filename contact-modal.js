/**
 * Contact modal v3
 * - Loads contact-modalv3.html + contact-modalv3.css dynamically
 * - Opens on #contact-btn
 * - Closes ONLY on [data-cm-close] (X + success close button)
 * - ESC closes
 * - On close: scrolls page to TOP
 * - Submit: Netlify Forms POST (no backend), then success UI
 */

(() => {
  const PATH_HTML = "contact-modal.html";
  const PATH_CSS  = "contact-modal.css";
  const NETLIFY_FORM_NAME = "contact";

  let mounted = false;
  let rootEl = null;
  let overlayEl = null;
  let modalEl = null;
  let lastActiveEl = null;

  function ensureCssLoaded(){
    const id = "contact-modal-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = PATH_CSS;
    document.head.appendChild(link);
  }

  function isOpen(){
    return overlayEl && overlayEl.getAttribute("aria-hidden") === "false";
  }

  function lockPage(){
    document.body.classList.add("cm-open");
  }

  function unlockPage(){
    document.body.classList.remove("cm-open");
  }

  function getFocusable(container){
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null);
  }

  function clearErrors(form){
    form?.querySelectorAll(".cm-error").forEach(el => (el.textContent = ""));
  }

  function setError(form, inputId, msg){
    const box = form?.querySelector(`.cm-error[data-for="${inputId}"]`);
    if (box) box.textContent = msg;
  }

  function validate(form){
    const name  = form.querySelector("#cm-name");
    const email = form.querySelector("#cm-email");
    const phone = form.querySelector("#cm-phone");

    let ok = true;

    if (!name.value.trim()){
      setError(form, "cm-name", "Kérlek add meg a neved.");
      ok = false;
    }

    const em = email.value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(em);
    if (!emailOk){
      setError(form, "cm-email", "Kérlek valós e-mail címet adj meg (pl. pelda@domain.hu).");
      ok = false;
    }

    const phRaw = phone.value.trim();
    const phCompact = phRaw.replace(/\s+/g, "");
    const phoneOk = /^\+?\d{7,15}$/.test(phCompact.replace(/[()-]/g, ""));
    if (!phoneOk){
      setError(form, "cm-phone", "Kérlek telefonszámot adj meg (csak számok, opcionális + jellel).");
      ok = false;
    }

    if (!ok){
      const firstError = form.querySelector(".cm-error:not(:empty)");
      const id = firstError?.getAttribute("data-for");
      const input = id ? form.querySelector("#" + id) : null;
      input?.focus?.();
    }
    return ok;
  }

  // --- UI state helpers ---

  function setSuccessMode(on){
    if (!rootEl) return;

    const form = rootEl.querySelector("#cm-form");
    const successBox = rootEl.querySelector(".cm-success");
    const hint = rootEl.querySelector(".cm-head .cm-hint");

    if (!form || !successBox) return;

    if (on){
      // success szöveg callback alapján
      const cb = rootEl.querySelector("#cm-callback");
      const tDefault = rootEl.querySelector(".cm-success-default");
      const tCallback = rootEl.querySelector(".cm-success-callback");


      const wantsCallback = !!cb?.checked;
      if (tDefault) tDefault.hidden = wantsCallback;
      if (tCallback) tCallback.hidden = !wantsCallback;

      form.querySelectorAll(".cm-grid, .cm-message, .cm-actions")
        .forEach(el => (el.style.display = "none"));

      if (hint) hint.style.display = "none";

      successBox.hidden = false;
    } else {
      form.querySelectorAll(".cm-grid, .cm-message, .cm-actions")
        .forEach(el => (el.style.display = ""));

      if (hint) hint.style.display = "";

      successBox.hidden = true;
    }
  }

  function resetSuccessUi(){
    const form = rootEl?.querySelector("#cm-form");
    const successBox = rootEl?.querySelector(".cm-success");
    if (!form || !successBox) return;

    if (!successBox.hidden){
      form.reset();
      clearErrors(form);
      setSuccessMode(false);
    } else {
      const hint = rootEl?.querySelector(".cm-head .cm-hint");
      if (hint) hint.style.display = "";
    }
  }

  function openModal(){
    if (!mounted) return;

    lastActiveEl = document.activeElement;

    overlayEl.setAttribute("aria-hidden", "false");
    lockPage();

    const first = overlayEl.querySelector("#cm-name") || getFocusable(modalEl)[0];
    setTimeout(() => first?.focus?.(), 0);
  }

  function closeModal(){
    if (!mounted) return;

    overlayEl.setAttribute("aria-hidden", "true");
    unlockPage();

    resetSuccessUi();

    try{
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }catch{
      window.scrollTo(0, 0);
    }

    if (lastActiveEl && typeof lastActiveEl.focus === "function"){
      lastActiveEl.focus();
    }
  }

  // --- Netlify submit helper (minimal) ---

  function toUrlEncoded(form){
    const fd = new FormData(form);

    // Netlify kötelező: form-name
    fd.set("form-name", NETLIFY_FORM_NAME);

    // checkbox: ha nincs bepipálva, biztosítsunk egy értéket
    if (!fd.has("callback")) fd.set("callback", "off");
    // ha be van pipálva, Netlify/HTML default "on" → oké

    // honeypot mező marad, ha üres (jó)

    return new URLSearchParams(Array.from(fd.entries())).toString();
  }

  async function submitToNetlify(form){
  const body = toUrlEncoded(form);

  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok){
    throw new Error(`Backend submit failed: ${res.status}`);
  }

  const out = await res.json().catch(() => ({}));
  if (!out.ok){
    throw new Error(out.error || "Backend returned not-ok");
  }
}

  async function mountModal(){
    if (mounted) return;

    ensureCssLoaded();

    const res = await fetch(PATH_HTML, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Modal HTML load failed: ${res.status}`);
    const html = await res.text();

    rootEl = document.createElement("div");
    rootEl.id = "contact-modal-root";
    rootEl.innerHTML = html;
    document.body.appendChild(rootEl);

    overlayEl = rootEl.querySelector(".cm-overlay");
    modalEl   = rootEl.querySelector(".cm-modal");
    if (!overlayEl || !modalEl) throw new Error("Modal markup missing .cm-overlay or .cm-modal");

    // Delegated close (ONLY X / success close button)
    overlayEl.addEventListener("click", (e) => {
      const closeEl = e.target.closest("[data-cm-close]");
      if (closeEl){
        e.preventDefault();
        closeModal();
      }
    });

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) closeModal();
    });

    // Focus trap
    overlayEl.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable(modalEl);
      if (!focusables.length) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first){
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last){
        e.preventDefault(); first.focus();
      }
    });

    // Phone input: allow only digits and + plus common separators
    const phone = rootEl.querySelector("#cm-phone");
    phone?.addEventListener("input", () => {
      const cleaned = phone.value.replace(/[^\d+\s()-]/g, "");
      if (cleaned !== phone.value) phone.value = cleaned;
    });

    // Submit (✅ most már Netlify POST)
    const form = rootEl.querySelector("#cm-form");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);
      if (!validate(form)) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn?.setAttribute("disabled", "disabled");

      try{
        await submitToNetlify(form);
        setSuccessMode(true);
      }catch(err){
        console.error(err);
        alert("Hiba történt a küldés közben. Kérlek próbáld újra később.");
      }finally{
        submitBtn?.removeAttribute("disabled");
      }
    });

    overlayEl.setAttribute("aria-hidden", "true");
    setSuccessMode(false);

    mounted = true;
  }

  function init(){
    const btn = document.querySelector("#contact-btn");
    if (!btn) return;

    // capture to beat your [data-scroll] handler
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      try{
        if (!mounted) await mountModal();
        openModal();
      }catch(err){
        console.error(err);
      }
    }, { capture: true });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

  window.ContactModal = {
    open: async () => { if (!mounted) await mountModal(); openModal(); },
    close: closeModal
  };
})();