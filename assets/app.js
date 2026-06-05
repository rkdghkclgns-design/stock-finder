// assets/app.js
// Bootstrap: load latest briefing, render header + body, wire nav and refresh.

(function () {
  "use strict";

  const { fetchLatestBriefing, triggerRefresh, readCache, writeCache } =
    window.StockFinderApi;
  const { renderBriefing } = window.StockFinderRender;

  const SECTION_LABELS = {
    "key-issues": "핵심 이슈",
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

    // Smooth scroll (with sticky-header offset handled by CSS scroll-margin-top).
    nav.querySelectorAll(".nav-pill").forEach((pill) => {
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        const id = pill.getAttribute("data-target");
        const target = document.getElementById(`sec-${id}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    setupScrollSpy(sections, nav);
  }

  function setupScrollSpy(sections, nav) {
    const pills = new Map(
      Array.from(nav.querySelectorAll(".nav-pill")).map((p) => [
        p.getAttribute("data-target"),
        p,
      ])
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute("data-section");
          pills.forEach((p) => p.classList.remove("active"));
          const active = pills.get(id);
          if (active) {
            active.classList.add("active");
            active.scrollIntoView({ block: "nearest", inline: "center" });
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
  }

  // ---- render orchestration --------------------------------------------------

  function render(row, { stale = false } = {}) {
    renderHeader(row);
    $("#briefing").innerHTML = renderBriefing(row.data || {});
    buildNav();

    const banner = $("#stale-banner");
    banner.hidden = !stale;

    $("#app").dataset.state = "ready";
    writeCache(row);
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
    } catch (err) {
      const cached = readCache();
      if (cached) {
        render(cached, { stale: true });
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
