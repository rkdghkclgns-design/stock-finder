// assets/app.js
// Bootstrap: load latest briefing, render header + body, wire nav and refresh.

(function () {
  "use strict";

  const {
    fetchLatestBriefing,
    triggerRefresh,
    ensureCurrent,
    analyzeCompany,
    readCache,
    writeCache,
  } = window.StockFinderApi;
  const { renderBriefing, recoCards, recoSummary, favCard, analysisBody, analysisError } =
    window.StockFinderRender;
  const Recommend = window.StockFinderRecommend;
  const Fav = window.StockFinderFav;

  const PROFILE_KEY = "stock_finder:profile";
  const DEFAULT_PROFILE = "balanced";
  const SCROLL_KEY = "stock_finder:scrollY";

  const analysisCache = new Map(); // favKey -> { state: 'loading'|'ok'|'error', data?, needsKey? }

  const SECTION_LABELS = {
    "key-issues": "핵심 이슈",
    fav: "관심",
    reco: "추천",
    domestic: "국내",
    overseas: "해외",
    ai: "AI",
    macro: "거시",
    strategy: "전략",
  };

  const $ = (sel) => document.querySelector(sel);

  // ---- formatting ------------------------------------------------------------

  function formatDate(dateStr, weekday) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    const wd = weekday ? ` (${weekday})` : "";
    return `${y}년 ${Number(m)}월 ${Number(d)}일${wd}`;
  }

  function formatUpdated(iso) {
    if (!iso) return "";
    try {
      const fmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${fmt.format(new Date(iso))} 갱신`;
    } catch {
      return "";
    }
  }

  function sourceLabel(source) {
    if (source === "cron") return "자동 갱신";
    if (source === "manual") return "수동 갱신";
    if (source === "seed") return "초기 데이터";
    return source || "";
  }

  // ---- header ----------------------------------------------------------------

  function renderHeader(row) {
    const data = row.data || {};
    $("#meta-date").textContent = formatDate(row.briefing_date, data.weekday);
    $("#meta-asof").textContent = data.as_of ? `· ${data.as_of} 기준` : "";
    $("#meta-basis").textContent = data.basis || "";
    $("#meta-updated").textContent = formatUpdated(row.generated_at);

    const chip = $("#meta-source");
    chip.textContent = sourceLabel(row.source);
    chip.className = `source-chip source-${row.source || "na"}`;
  }

  // ---- section nav (scroll-spy) ---------------------------------------------

  function buildNav() {
    const nav = $("#section-nav");
    const sections = Array.from(document.querySelectorAll("[data-section]"));
    if (!sections.length) {
      nav.hidden = true;
      return;
    }
    nav.innerHTML = sections
      .map((s) => {
        const id = s.getAttribute("data-section");
        const label = SECTION_LABELS[id] || id;
        return `<a class="nav-pill" href="#sec-${id}" data-target="${id}">${label}</a>`;
      })
      .join("");
    nav.hidden = false;

    // Nav pills are plain in-page anchors (href="#sec-..."). Native hash
    // navigation + CSS `scroll-behavior: smooth` + `scroll-margin-top` handles
    // smooth scrolling and the sticky-nav offset. This is far more robust than a
    // JS scrollIntoView (whose use inside the scroll-spy caused the jump-to-top bug).
    setupScrollSpy(sections, nav);
  }

  let removeScrollSpy = null;

  function setupScrollSpy(sections, nav) {
    // Detach any spy from a previous render() to avoid stacking listeners.
    if (removeScrollSpy) removeScrollSpy();

    const pills = new Map(
      Array.from(nav.querySelectorAll(".nav-pill")).map((p) => [
        p.getAttribute("data-target"),
        p,
      ])
    );
    let lastId = null;

    // Active section = the last one whose top has passed the probe line (28% down).
    const update = () => {
      const probe = window.innerHeight * 0.28;
      let currentId = sections[0].getAttribute("data-section");
      for (const s of sections) {
        if (s.getBoundingClientRect().top - probe <= 0) {
          currentId = s.getAttribute("data-section");
        } else {
          break;
        }
      }
      if (currentId === lastId) return;
      lastId = currentId;
      pills.forEach((p, id) => p.classList.toggle("active", id === currentId));
      const active = pills.get(currentId);
      if (active) centerPillInNav(nav, active); // horizontal nav scroll only
    };

    // Call update() directly (cheap, self-guarded by lastId). We avoid
    // requestAnimationFrame here because it is throttled/paused when the page
    // is backgrounded, which would freeze the highlight.
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    removeScrollSpy = () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    update();
  }

  /**
   * Center the active pill within the nav by scrolling the nav HORIZONTALLY only.
   * (Using element.scrollIntoView here would scroll the whole document to the
   * sticky nav's in-flow position at the top of the page — the jump-to-top bug.)
   */
  function centerPillInNav(nav, pill) {
    const navRect = nav.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const delta =
      pillRect.left - navRect.left - (nav.clientWidth - pill.offsetWidth) / 2;
    nav.scrollTo({ left: nav.scrollLeft + delta, behavior: "smooth" });
  }

  // ---- render orchestration --------------------------------------------------

  function render(row, { stale = false } = {}) {
    const data = row.data || {};
    renderHeader(row);
    $("#briefing").innerHTML = renderBriefing(data);
    buildNav();
    setupRecommendations(data);
    setupFavorites();
    syncStars();

    const banner = $("#stale-banner");
    banner.hidden = !stale;

    $("#app").dataset.state = "ready";
    writeCache(row);
  }

  // ---- recommendations -------------------------------------------------------

  function loadProfile() {
    try {
      return localStorage.getItem(PROFILE_KEY);
    } catch {
      return null;
    }
  }
  function saveProfile(id) {
    try {
      localStorage.setItem(PROFILE_KEY, id);
    } catch {
      /* storage unavailable; ignore */
    }
  }

  function setupRecommendations(data) {
    if (!Recommend) return;
    const wrap = document.querySelector(".reco-profiles");
    if (!wrap) return;

    const recs = Recommend.build(data);
    const stored = loadProfile();
    let current = Recommend.PROFILES.some((p) => p.id === stored)
      ? stored
      : DEFAULT_PROFILE;

    const paint = (profileId) => {
      const prof = Recommend.PROFILES.find((p) => p.id === profileId);
      const list = Recommend.filter(recs, profileId);
      const listEl = $("#reco-list");
      const sumEl = $("#reco-summary");
      if (listEl) listEl.innerHTML = recoCards(list);
      if (sumEl) sumEl.innerHTML = recoSummary(list, prof ? prof.label : "");
      wrap.querySelectorAll(".reco-profile").forEach((b) =>
        b.classList.toggle("active", b.dataset.profile === profileId)
      );
    };

    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".reco-profile");
      if (!btn) return;
      current = btn.dataset.profile;
      saveProfile(current);
      paint(current);
    });

    paint(current);
  }

  // ---- favorites + AI analysis ----------------------------------------------

  function favBody(key) {
    const els = document.querySelectorAll("[data-fav-body]");
    for (const el of els) {
      if (el.getAttribute("data-fav-body") === key) return el;
    }
    return null;
  }

  function syncStars() {
    if (!Fav) return;
    document.querySelectorAll(".fav-star").forEach((b) => {
      const on = Fav.isFavorite(b.dataset.favKey);
      b.classList.toggle("is-fav", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "★" : "☆";
    });
  }

  function setupFavorites() {
    if (!Fav) return;
    const listEl = $("#fav-list");
    const emptyEl = $("#fav-empty");
    if (!listEl) return;
    const favs = Fav.getFavorites();
    if (emptyEl) emptyEl.hidden = favs.length > 0;
    listEl.innerHTML = favs.map((f) => favCard(f)).join("");
    favs.forEach((f) => loadAnalysis(f));
  }

  async function loadAnalysis(item) {
    const fill = (html) => {
      const el = favBody(item.key);
      if (el) el.innerHTML = html;
    };
    const cached = analysisCache.get(item.key);
    if (cached) {
      if (cached.state === "ok") return fill(analysisBody(cached.data));
      if (cached.state === "error") return fill(analysisError(cached.needsKey));
      if (cached.state === "loading") return; // an in-flight request will fill it
    }
    analysisCache.set(item.key, { state: "loading" });
    try {
      const res = await analyzeCompany(item.name, item.ticker, item.market);
      if (res && res.ok && res.data) {
        analysisCache.set(item.key, { state: "ok", data: res.data });
        fill(analysisBody(res.data));
      } else {
        const needsKey = !!(res && res.needs_key);
        analysisCache.set(item.key, { state: "error", needsKey });
        fill(analysisError(needsKey));
      }
    } catch {
      analysisCache.set(item.key, { state: "error", needsKey: false });
      fill(analysisError(false));
    }
  }

  function addFavoriteFromInput() {
    const input = $("#fav-input");
    if (!input || !Fav) return;
    const name = input.value.trim();
    if (!name) return;
    Fav.addFavorite({ key: Fav.favKey(name, ""), name, ticker: "", market: "" });
    input.value = "";
    syncStars();
    setupFavorites();
  }

  function onBriefingClick(e) {
    if (!Fav) return;
    if (e.target.closest("#fav-add-btn")) {
      addFavoriteFromInput();
      return;
    }
    const star = e.target.closest(".fav-star");
    if (star) {
      Fav.toggleFavorite({
        key: star.dataset.favKey,
        name: star.dataset.favName,
        ticker: star.dataset.favTicker || "",
        market: star.dataset.favMarket || "",
      });
      syncStars();
      setupFavorites();
      return;
    }
    const remove = e.target.closest(".fav-remove");
    if (remove) {
      Fav.removeFavorite(remove.dataset.favRemove);
      syncStars();
      setupFavorites();
      return;
    }
    const retry = e.target.closest(".fav-retry");
    if (retry) {
      const card = retry.closest("[data-fav-card]");
      const key = card && card.getAttribute("data-fav-card");
      if (!key) return;
      analysisCache.delete(key);
      const fav = Fav.getFavorites().find((f) => f.key === key);
      if (fav) loadAnalysis(fav);
    }
  }

  function onBriefingKeydown(e) {
    if (e.key === "Enter" && e.target && e.target.id === "fav-input") {
      e.preventDefault();
      addFavoriteFromInput();
    }
  }

  // ---- auto-update + scroll position ----------------------------------------

  // Bring the briefing to "now": the server regenerates only if today's is
  // missing/stale (6h freshness). If a fresh one is produced, swap it in.
  async function maybeAutoUpdate() {
    try {
      const res = await ensureCurrent();
      if (res && res.ok && res.status === "generated") {
        const row = await fetchLatestBriefing();
        withScrollPreserved(() => render(row, { stale: false }));
      }
    } catch {
      /* offline / billing / transient — keep showing current data */
    }
  }

  function saveScroll() {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
    } catch {
      /* ignore */
    }
  }

  function restoreScroll() {
    let y = 0;
    try {
      y = parseInt(sessionStorage.getItem(SCROLL_KEY) || "0", 10) || 0;
    } catch {
      y = 0;
    }
    if (y <= 0) return;
    const go = () => scrollToInstant(y);
    requestAnimationFrame(go);
    setTimeout(go, 150); // after async layout settles
  }

  // Force an INSTANT scroll even when CSS `scroll-behavior: smooth` is active
  // (we are restoring/preserving a position, not animating to it).
  function scrollToInstant(y) {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, y);
    html.style.scrollBehavior = prev;
  }

  function withScrollPreserved(fn) {
    const y = window.scrollY;
    fn();
    const go = () => scrollToInstant(y);
    requestAnimationFrame(go);
    setTimeout(go, 60);
  }

  function showError(message) {
    $("#app").dataset.state = "error";
    $("#error-text").textContent = message || "데이터를 불러오지 못했습니다.";
  }

  async function load() {
    $("#app").dataset.state = "loading";
    try {
      const row = await fetchLatestBriefing();
      render(row, { stale: false });
      restoreScroll();
      maybeAutoUpdate(); // bring to "now" in the background
    } catch (err) {
      const cached = readCache();
      if (cached) {
        render(cached, { stale: true });
        restoreScroll();
      } else {
        showError(String(err.message || err));
      }
    }
  }

  // ---- refresh controls ------------------------------------------------------

  function wireControls() {
    $("#btn-reload").addEventListener("click", load);
    const retry = $("#btn-retry");
    if (retry) retry.addEventListener("click", load);

    // Delegated handlers on the persistent #briefing container (survives re-render).
    const briefing = $("#briefing");
    if (briefing) {
      briefing.addEventListener("click", onBriefingClick);
      briefing.addEventListener("keydown", onBriefingKeydown);
    }
    window.addEventListener("scroll", saveScroll, { passive: true });

    const cfg = window.STOCK_FINDER_CONFIG;
    const forceBtn = $("#btn-force");
    if (!cfg || !cfg.ADMIN_SECRET) {
      forceBtn.hidden = true;
      return;
    }
    forceBtn.hidden = false;
    forceBtn.addEventListener("click", async () => {
      forceBtn.disabled = true;
      const original = forceBtn.textContent;
      forceBtn.textContent = "갱신 중…";
      try {
        const before = readCache();
        const beforeAt = before && before.generated_at;
        await triggerRefresh();
        // Poll until the stored briefing changes (generation is async, ~30–60s).
        await pollForUpdate(beforeAt, 18, 5000, forceBtn);
      } catch (err) {
        alert(`갱신 실패: ${err.message || err}`);
      } finally {
        forceBtn.disabled = false;
        forceBtn.textContent = original;
      }
    });
  }

  async function pollForUpdate(beforeAt, tries, intervalMs, btn) {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const row = await fetchLatestBriefing();
        if (!beforeAt || row.generated_at !== beforeAt) {
          render(row, { stale: false });
          return;
        }
      } catch {
        /* keep polling */
      }
      if (btn) btn.textContent = `갱신 중… (${i + 1})`;
    }
    await load(); // final attempt
  }

  // ---- start -----------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    wireControls();
    load();
  });
})();
