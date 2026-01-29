// script.js
(() => {
  console.log("SCRIPT VERSION:", "2026-01-21 DIV-SCROLL v1");

  // ---- Mobile menu ----
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const open = navMenu.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
  }

  // ---- Press effect (gomb blur) ----
  document.addEventListener("click", (e) => {
    const press = e.target.closest("[data-press]");
    if (press) press.blur();
  });

  // ---- Header magasság -> CSS változó (scroll-margin-top miatt) ----
  function updateHeaderHeightVar() {
    const header = document.querySelector(".header");
    const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--headerH", `${h}px`);
    // debug
    // console.log("headerH =", h);
  }

  updateHeaderHeightVar();
  window.addEventListener("resize", updateHeaderHeightVar);

  // ---- DIV-re (szekcióra) görgetés ----
  function scrollToTarget(targetSelector) {
    const el = document.querySelector(targetSelector);
    if (!el) return;

    // A CSS scroll-margin-top intézi a header miatti eltartást
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- EGYETLEN kattintáskezelő: data-scroll + sima # linkek ----
  document.addEventListener("click", (e) => {
    const linkOrBtn = e.target.closest("a, button");
    if (!linkOrBtn) return;

    // 1) data-scroll előnyben
    const ds = linkOrBtn.getAttribute("data-scroll");
    if (ds && ds.startsWith("#")) {
      e.preventDefault();
      scrollToTarget(ds);

      // mobil menü zárás
      if (navMenu && navMenu.classList.contains("open")) {
        navMenu.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
      }
      return;
    }

    // 2) sima hash link
    if (linkOrBtn.tagName === "A") {
      const href = linkOrBtn.getAttribute("href");
      if (href && href.startsWith("#") && href !== "#") {
        e.preventDefault();
        scrollToTarget(href);

        // mobil menü zárás
        if (navMenu && navMenu.classList.contains("open")) {
          navMenu.classList.remove("open");
          navToggle?.setAttribute("aria-expanded", "false");
        }
      }
    }
  });

  // ---- évszám ----
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
