// assets/render.js
// Pure rendering helpers: briefing JSON -> HTML string. Inputs are never mutated.
// All user/model-supplied text is escaped to prevent XSS.

(function () {
  "use strict";

  // ---- primitives -----------------------------------------------------------

  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** True when a value carries real content (not empty / not a placeholder dash). */
  function has(v) {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    return s !== "" && s !== "-";
  }

  function dirClass(direction) {
    if (direction === "up") return "up";
    if (direction === "down") return "down";
    return "flat";
  }

  function dirArrow(direction) {
    if (direction === "up") return "▲";
    if (direction === "down") return "▼";
    return "·";
  }

  /** Coloured change badge. Falls back to a neutral dash when no change is known. */
  function badge(change, direction) {
    const cls = dirClass(direction);
    if (!has(change)) return `<span class="badge badge-flat">–</span>`;
    return `<span class="badge badge-${cls}">${dirArrow(direction)} ${esc(change)}</span>`;
  }

  const list = (arr) => (Array.isArray(arr) ? arr : []);

  // ---- section: key issues ---------------------------------------------------

  function keyIssues(issues) {
    const items = list(issues);
    if (!items.length) return "";
    const cards = items
      .map(
        (it) => `
        <article class="issue-card">
          <div class="issue-mark">!</div>
          <div class="issue-body">
            <h3 class="issue-title">${esc(it.title)}</h3>
            <p class="issue-text">${esc(it.body)}</p>
          </div>
        </article>`
      )
      .join("");
    return section("key-issues", "🔑", "오늘의 핵심 이슈", `<div class="issue-list">${cards}</div>`);
  }

  // ---- section: domestic -----------------------------------------------------

  function indexGrid(indices) {
    const items = list(indices);
    if (!items.length) return "";
    return `<div class="index-grid">${items
      .map(
        (ix) => `
        <div class="index-card index-${dirClass(ix.direction)}">
          <div class="index-name">${esc(ix.name)}</div>
          <div class="index-value">${esc(ix.value)}</div>
          ${badge(ix.change, ix.direction)}
          ${has(ix.note) ? `<div class="index-note">${esc(ix.note)}</div>` : ""}
        </div>`
      )
      .join("")}</div>`;
  }

  function investors(inv) {
    if (!inv) return "";
    const buys = list(inv.top_buys)
      .map(
        (b) => `
        <li class="rank-item">
          <span class="rank-num">${esc(b.rank)}</span>
          <div class="rank-main">
            <div class="rank-name">${esc(b.name)}${has(b.detail) ? ` <span class="rank-detail">${esc(b.detail)}</span>` : ""}</div>
            ${has(b.reason) ? `<div class="rank-reason">${esc(b.reason)}</div>` : ""}
          </div>
        </li>`
      )
      .join("");

    return `
      <div class="subblock">
        <h3 class="subtitle">투자자별 동향</h3>
        <div class="kv-list">
          ${has(inv.foreign) ? kv("외국인", inv.foreign) : ""}
          ${has(inv.institutional) ? kv("기관", inv.institutional) : ""}
        </div>
        ${buys ? `<ol class="rank-list">${buys}</ol>` : ""}
        ${has(inv.top_sells) ? `<p class="note note-sell"><b>순매도 상위</b> · ${esc(inv.top_sells)}</p>` : ""}
      </div>`;
  }

  function kv(label, value) {
    return `<div class="kv"><span class="kv-key">${esc(label)}</span><span class="kv-val">${esc(value)}</span></div>`;
  }

  function sectors(arr) {
    const items = list(arr);
    if (!items.length) return "";
    return `
      <div class="subblock">
        <h3 class="subtitle">주요 테마 섹터</h3>
        <ul class="line-list">
          ${items
            .map(
              (s) => `
            <li class="line-item line-${dirClass(s.direction)}">
              <span class="line-head">${dirArrow(s.direction)} ${esc(s.name)}</span>
              ${has(s.reason) ? `<span class="line-reason">${esc(s.reason)}</span>` : ""}
            </li>`
            )
            .join("")}
        </ul>
      </div>`;
  }

  function targetPrices(arr) {
    const items = list(arr);
    if (!items.length) return "";
    return `
      <div class="subblock">
        <h3 class="subtitle">증권사 목표가 변경</h3>
        <ul class="target-list">
          ${items
            .map(
              (t) => `
            <li class="target-item">
              <div class="target-stock">${esc(t.stock)}<span class="target-broker">${esc(t.broker)}</span></div>
              <div class="target-move target-${dirClass(t.direction)}">
                ${has(t.from) ? `<span class="target-from">${esc(t.from)}</span><span class="target-arrow">→</span>` : ""}
                <span class="target-to">${esc(t.to)}</span>
              </div>
            </li>`
            )
            .join("")}
        </ul>
      </div>`;
  }

  function domestic(d) {
    if (!d) return "";
    const body = `
      ${indexGrid(d.indices)}
      ${has(d.note) ? `<p class="note">${esc(d.note)}</p>` : ""}
      ${investors(d.investors)}
      ${sectors(d.sectors)}
      ${targetPrices(d.target_prices)}`;
    return section("domestic", "🇰🇷", "국내 주식 시장", body);
  }

  // ---- section: overseas -----------------------------------------------------

  function overseas(o) {
    if (!o) return "";
    const block = (title, indices, note) => {
      if (!list(indices).length) return "";
      return `
        <div class="subblock">
          <h3 class="subtitle">${esc(title)}</h3>
          ${indexGrid(indices)}
          ${has(note) ? `<p class="note">${esc(note)}</p>` : ""}
        </div>`;
    };
    const body = `
      ${block("미국", o.us, o.us_note)}
      ${block("아시아", o.asia, o.asia_note)}
      ${block("유럽", o.europe, o.europe_note)}`;
    return section("overseas", "🌎", "해외 주식 시장", body);
  }

  // ---- section: AI stocks ----------------------------------------------------

  function tradeChips(buy, sell) {
    const chips = [];
    if (has(buy)) chips.push(`<span class="chip chip-buy"><b>매수</b> ${esc(buy)}</span>`);
    if (has(sell)) chips.push(`<span class="chip chip-sell"><b>매도</b> ${esc(sell)}</span>`);
    return chips.length ? `<div class="stock-trade">${chips.join("")}</div>` : "";
  }

  function usStockCard(s) {
    return `
      <article class="stock-card">
        <div class="stock-head">
          <div class="stock-id">
            <span class="stock-name">${esc(s.name)}</span>
            <span class="stock-ticker">${esc(s.ticker)}</span>
          </div>
          <div class="stock-quote">
            <span class="stock-price">${esc(s.price)}</span>
            ${badge(s.change, s.direction)}
          </div>
        </div>
        ${has(s.note) ? `<p class="stock-note">${esc(s.note)}</p>` : ""}
        ${tradeChips(s.buy, s.sell)}
      </article>`;
  }

  function krStockCard(s) {
    const meta = [];
    if (has(s.market_cap)) meta.push(`<span class="meta-chip">시총 ${esc(s.market_cap)}</span>`);
    if (has(s.target)) meta.push(`<span class="meta-chip meta-target">목표가 ${esc(s.target)}</span>`);
    return `
      <article class="stock-card">
        <div class="stock-head">
          <div class="stock-id">
            <span class="stock-name">${esc(s.name)}</span>
            <span class="stock-ticker">${esc(s.code)}</span>
          </div>
          <div class="stock-quote">
            <span class="stock-price">${esc(s.price)}</span>
            ${badge(s.change, s.direction)}
          </div>
        </div>
        ${meta.length ? `<div class="stock-meta">${meta.join("")}</div>` : ""}
        ${has(s.reason) ? `<p class="stock-note">${esc(s.reason)}</p>` : ""}
        ${tradeChips(s.buy, s.sell)}
      </article>`;
  }

  function themes(arr) {
    const items = list(arr);
    if (!items.length) return "";
    return `
      <div class="subblock">
        <h3 class="subtitle">기타 주목 테마 (AI 외)</h3>
        <ul class="theme-list">
          ${items
            .map(
              (t) => `
            <li class="theme-item">
              <span class="theme-badge">${esc(t.sector)}</span>
              <div class="theme-body">
                ${has(t.examples) ? `<div class="theme-examples">${esc(t.examples)}</div>` : ""}
                ${has(t.point) ? `<div class="theme-point">${esc(t.point)}</div>` : ""}
              </div>
            </li>`
            )
            .join("")}
        </ul>
      </div>`;
  }

  function aiStocks(ai) {
    if (!ai) return "";
    const us = list(ai.us);
    const kr = list(ai.kr);
    const body = `
      ${kr.length ? `<div class="subblock"><h3 class="subtitle">국내 AI 관련주</h3><div class="stock-list">${kr.map(krStockCard).join("")}</div></div>` : ""}
      ${us.length ? `<div class="subblock"><h3 class="subtitle">미국 AI 핵심주</h3><div class="stock-list">${us.map(usStockCard).join("")}</div></div>` : ""}
      ${themes(ai.other_themes)}`;
    return section("ai", "⭐", "AI 관련주 집중 분석", body);
  }

  // ---- section: macro --------------------------------------------------------

  function macro(m) {
    if (!m) return "";
    const fx = list(m.forex_commodities);
    const fxBlock = fx.length
      ? `<div class="subblock"><h3 class="subtitle">환율 · 원자재</h3>
          <div class="stat-list">${fx
            .map(
              (r) => `
            <div class="stat-row">
              <span class="stat-item">${esc(r.item)}</span>
              <span class="stat-value">${esc(r.value)}</span>
              <span class="stat-change">${has(r.change) ? esc(r.change) : ""}</span>
              ${has(r.note) ? `<span class="stat-note">${esc(r.note)}</span>` : ""}
            </div>`
            )
            .join("")}</div></div>`
      : "";

    const rates = list(m.rates);
    const ratesBlock = rates.length
      ? `<div class="subblock"><h3 class="subtitle">기준금리</h3>
          <div class="rate-grid">${rates
            .map(
              (r) => `
            <div class="rate-card">
              <div class="rate-country">${esc(r.country)}</div>
              <div class="rate-value">${esc(r.rate)}</div>
              ${has(r.last_change) ? `<div class="rate-sub">최근: ${esc(r.last_change)}</div>` : ""}
              ${has(r.outlook) ? `<div class="rate-outlook">${esc(r.outlook)}</div>` : ""}
            </div>`
            )
            .join("")}</div></div>`
      : "";

    const events = list(m.events);
    const eventsBlock = events.length
      ? `<div class="subblock"><h3 class="subtitle">주요 경제 이벤트</h3>
          <ul class="event-list">${events
            .map(
              (e) => `
            <li class="event-item">
              <span class="event-time">${esc(e.time)}</span>
              <span class="event-text">${esc(e.event)}</span>
            </li>`
            )
            .join("")}</ul></div>`
      : "";

    return section("macro", "📊", "거시경제 지표", fxBlock + ratesBlock + eventsBlock);
  }

  // ---- section: strategy -----------------------------------------------------

  function bulletList(title, arr) {
    const items = list(arr);
    if (!items.length) return "";
    return `<div class="subblock"><h3 class="subtitle">${esc(title)}</h3>
      <ul class="bullet-list">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  }

  function strategy(s) {
    if (!s) return "";
    const risks = list(s.risks);
    const banner = has(s.direction)
      ? `<div class="strategy-banner">
          <span class="strategy-label">시장 방향성</span>
          <span class="strategy-direction">${esc(s.direction)}</span>
          ${has(s.direction_note) ? `<span class="strategy-note">${esc(s.direction_note)}</span>` : ""}
        </div>`
      : "";
    const riskBlock = risks.length
      ? `<div class="subblock"><h3 class="subtitle">주요 리스크 요인</h3>
          <ul class="risk-list">${risks
            .map(
              (r) => `
            <li class="risk-item">
              <div class="risk-name">${esc(r.risk)}</div>
              ${has(r.detail) ? `<div class="risk-detail">${esc(r.detail)}</div>` : ""}
            </li>`
            )
            .join("")}</ul></div>`
      : "";
    const body = `
      ${banner}
      ${bulletList("판단 근거", s.rationale)}
      ${bulletList("단기 (1~2주) 추천", s.short_term)}
      ${bulletList("중기 (1~3개월) 추천", s.mid_term)}
      ${bulletList("매매 시 주의사항", s.cautions)}
      ${riskBlock}`;
    return section("strategy", "🧭", "오늘의 투자 전략", body);
  }

  // ---- footer: sources + disclaimer ------------------------------------------

  function footer(b) {
    const sources = list(b.sources).filter((s) => has(s.url));
    const srcBlock = sources.length
      ? `<div class="source-block">
          <h3 class="subtitle">출처</h3>
          <ul class="source-list">${sources
            .map(
              (s) =>
                `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`
            )
            .join("")}</ul></div>`
      : "";
    const disc = has(b.disclaimer)
      ? `<p class="disclaimer">${esc(b.disclaimer)}</p>`
      : "";
    return `<footer class="briefing-footer">${srcBlock}${disc}</footer>`;
  }

  // ---- section wrapper + top-level -------------------------------------------

  function section(id, icon, title, innerHtml) {
    if (!innerHtml || !innerHtml.trim()) return "";
    return `
      <section class="section" id="sec-${id}" data-section="${id}">
        <h2 class="section-title"><span class="section-icon">${icon}</span>${esc(title)}</h2>
        ${innerHtml}
      </section>`;
  }

  /** Assemble the full briefing body from a `data` object. */
  function renderBriefing(b) {
    if (!b) return "";
    return (
      keyIssues(b.key_issues) +
      domestic(b.domestic) +
      overseas(b.overseas) +
      aiStocks(b.ai_stocks) +
      macro(b.macro) +
      strategy(b.strategy) +
      footer(b)
    );
  }

  window.StockFinderRender = Object.freeze({ renderBriefing, esc });
})();
