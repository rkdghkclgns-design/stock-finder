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
        ${favStar(s.name, s.ticker, "US")}
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
        ${priceGauge(s.buy, s.price, s.sell)}
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
        ${favStar(s.name, s.code, "KR")}
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
        ${priceGauge(s.buy, s.price, s.sell)}
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

  // ---- section: recommendations ---------------------------------------------

  const RISK_LABEL = { low: "낮음", mid: "중간", high: "높음" };
  const CONV_LABEL = { 3: "강력 추천", 2: "추천", 1: "관심" };

  /** Static shell for the recommendation section (list filled by app.js). */
  function recoSection() {
    const reco = window.StockFinderRecommend;
    if (!reco || !reco.PROFILES || !reco.PROFILES.length) return "";
    const pills = reco.PROFILES.map(
      (p, i) =>
        `<button class="reco-profile${i === 1 ? " active" : ""}" type="button" role="tab" data-profile="${esc(p.id)}" title="${esc(p.desc)}">${esc(p.label)}</button>`
    ).join("");
    const inner = `
      <p class="reco-intro">투자 성향을 선택하면 오늘 브리핑 데이터를 분석해 <b>기대 수익률</b>과 함께 종목을 추천합니다.</p>
      <div class="reco-profiles" role="tablist">${pills}</div>
      <div id="reco-summary" class="reco-summary"></div>
      <div id="reco-list" class="reco-list"></div>
      <p class="reco-disc">⚠ 추천은 브리핑의 매수가·목표가 등 공개 데이터로 자동 계산한 <b>참고 지표</b>이며, 투자 권유가 아닙니다. 최종 판단과 책임은 투자자 본인에게 있습니다.</p>`;
    return section("reco", "💡", "오늘의 투자 추천", inner);
  }

  /** Render the recommendation cards for an already-filtered list. */
  function recoCards(recs) {
    if (!recs || !recs.length) {
      return `<p class="reco-empty">현재 성향에 맞는 추천 종목이 없습니다.</p>`;
    }
    return recs
      .map((r) => {
        const convCls = r.conviction === 3 ? "conv-strong" : r.conviction === 2 ? "conv-mid" : "conv-watch";
        const exp =
          r.expReturn != null
            ? `<span class="reco-exp ${r.expReturn >= 0 ? "exp-up" : "exp-down"}">${r.expReturn >= 0 ? "+" : ""}${Math.round(r.expReturn)}%</span>`
            : `<span class="reco-exp exp-flat">—</span>`;
        const market = r.market === "KR" ? "국내" : "해외";
        return `
        <article class="reco-card ${convCls}">
          ${favStar(r.name, r.id, r.market)}
          <div class="reco-card-head">
            <div class="reco-id">
              <span class="reco-conv">${esc(CONV_LABEL[r.conviction] || "관심")}</span>
              <span class="reco-name">${esc(r.name)}</span>
              <span class="reco-market">${market}${r.id ? " · " + esc(r.id) : ""}</span>
            </div>
            <div class="reco-exp-wrap">
              <span class="reco-exp-label">기대수익</span>
              ${exp}
            </div>
          </div>
          ${returnBar(r.expReturn)}
          <div class="reco-tags">
            <span class="reco-tag tag-action">${esc(r.action)}</span>
            <span class="reco-tag risk-${r.risk}">위험 ${RISK_LABEL[r.risk] || "중간"}</span>
            <span class="reco-tag tag-horizon">${esc(r.horizon)}</span>
          </div>
          <div class="reco-prices">
            ${has(r.entry) ? `<span class="reco-price"><b>진입</b> ${esc(r.entry)}</span>` : ""}
            ${has(r.target) ? `<span class="reco-price"><b>목표</b> ${esc(r.target)}</span>` : ""}
            ${has(r.price) ? `<span class="reco-price"><b>현재</b> ${esc(r.price)}</span>` : ""}
          </div>
          ${has(r.reason) ? `<p class="reco-reason">${esc(r.reason)}</p>` : ""}
        </article>`;
      })
      .join("");
  }

  /** Compact summary line above the cards. */
  function recoSummary(recs, profileLabel) {
    if (!recs || !recs.length) return "";
    const withExp = recs.filter((r) => r.expReturn != null);
    const avg = withExp.length
      ? Math.round(withExp.reduce((a, r) => a + r.expReturn, 0) / withExp.length)
      : null;
    const strong = recs.filter((r) => r.conviction === 3).length;
    return (
      `<span class="reco-sum-item"><b>${esc(profileLabel)}</b> 추천 ${recs.length}종목</span>` +
      (avg != null
        ? `<span class="reco-sum-item">평균 기대수익 <b class="${avg >= 0 ? "exp-up" : "exp-down"}">${avg >= 0 ? "+" : ""}${avg}%</b></span>`
        : "") +
      (strong ? `<span class="reco-sum-item">강력추천 ${strong}종목</span>` : "")
    );
  }

  // ---- visualization helpers -------------------------------------------------

  /** Horizontal gauge showing where `current` sits between buy(low) and target(high). */
  function priceGauge(buy, current, sell) {
    const pos = window.SF.pricePosition(buy, current, sell);
    if (pos === null) return "";
    const pct = Math.round(pos * 100);
    return `
      <div class="gauge" title="매수가~목표가 구간 내 현재가 위치">
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${pct}%"></div>
          <span class="gauge-marker" style="left:${pct}%"></span>
        </div>
        <div class="gauge-ends">
          <span>매수 ${esc(buy)}</span>
          <span>목표 ${esc(sell)}</span>
        </div>
      </div>`;
  }

  /** Expected-return magnitude bar (±25% maps to full width). */
  function returnBar(expReturn) {
    if (expReturn === null || expReturn === undefined) return "";
    const mag = window.SF.clamp(Math.abs(expReturn) / 25, 0, 1) * 100;
    const cls = expReturn >= 0 ? "ret-up" : "ret-down";
    return `<div class="ret-bar"><div class="ret-fill ${cls}" style="width:${mag.toFixed(0)}%"></div></div>`;
  }

  /** Inline SVG sparkline from trend points. */
  function sparkline(points, direction) {
    const W = 132;
    const H = 40;
    const g = window.SF.sparkPath(points, W, H, 3);
    if (!g) return "";
    const up = direction === "up" ? true : direction === "down" ? false : g.up;
    return `<svg class="spark ${up ? "spark-up" : "spark-down"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="spark-area" points="${g.area}" />
      <polyline class="spark-line" points="${g.line}" />
    </svg>`;
  }

  /** Favorite star toggle button (state reconciled by app.js). */
  function favStar(name, ticker, market) {
    const fav = window.StockFinderFav;
    const key = fav ? fav.favKey(name, ticker) : `${ticker || ""}|${name || ""}`.toLowerCase();
    const on = fav && fav.isFavorite(key);
    return `<button class="fav-star${on ? " is-fav" : ""}" type="button" aria-label="관심 종목 추가/제거" aria-pressed="${on ? "true" : "false"}" data-fav-key="${esc(key)}" data-fav-name="${esc(name)}" data-fav-ticker="${esc(ticker || "")}" data-fav-market="${esc(market || "")}">${on ? "★" : "☆"}</button>`;
  }

  // ---- market pulse (hero) ---------------------------------------------------

  function pulseTile(ix) {
    return `<div class="pulse-tile pulse-${dirClass(ix.direction)}">
      <span class="pulse-name">${esc(ix.name)}</span>
      <span class="pulse-value">${esc(ix.value)}</span>
      ${badge(ix.change, ix.direction)}
    </div>`;
  }

  function marketPulse(b) {
    const dom = list(b.domestic && b.domestic.indices);
    const us = list(b.overseas && b.overseas.us);
    const tiles = dom.concat(us).slice(0, 5);
    if (!tiles.length) return "";
    const s = b.strategy || {};
    const banner = has(s.direction)
      ? `<div class="pulse-banner">
          <span class="pulse-dot pulse-${dirClass(strategyDir(s.direction))}"></span>
          <span class="pulse-dir">${esc(s.direction)}</span>
          ${has(s.direction_note) ? `<span class="pulse-note">${esc(s.direction_note)}</span>` : ""}
        </div>`
      : "";
    return `<div class="pulse">
      <div class="pulse-row">${tiles.map(pulseTile).join("")}</div>
      ${banner}
    </div>`;
  }

  // crude sentiment from a Korean market-direction phrase
  function strategyDir(text) {
    const t = String(text || "");
    if (/(상승|반등|강세|회복)/.test(t) && !/(하락|약세)/.test(t)) return "up";
    if (/(하락|약세|조정|하방)/.test(t) && !/(상승|반등|강세)/.test(t)) return "down";
    return "flat";
  }

  // ---- favorites -------------------------------------------------------------

  function favSection() {
    const inner = `
      <p class="fav-intro">관심 종목을 추가하면 AI가 <b>최근 추이</b>와 <b>전망</b>을 분석해 드립니다.</p>
      <div class="fav-add">
        <input id="fav-input" class="fav-input" type="text" inputmode="text"
               placeholder="종목명 입력 후 추가 (예: 카카오, AAPL)" aria-label="관심 종목 추가" />
        <button id="fav-add-btn" class="fav-add-btn" type="button">추가</button>
      </div>
      <div id="fav-list" class="fav-list"></div>
      <p id="fav-empty" class="fav-empty">아직 관심 종목이 없습니다. 종목 카드의 ☆ 를 누르거나 위에서 검색해 추가해 보세요.</p>`;
    return section("fav", "⭐", "관심 종목 AI 분석", inner);
  }

  /** Placeholder card shown while the analysis loads. */
  function favCard(item) {
    return `<article class="fav-card" data-fav-card="${esc(item.key)}">
      <div class="fav-card-head">
        <div class="fav-id">
          <span class="fav-name">${esc(item.name)}</span>
          ${item.ticker ? `<span class="fav-ticker">${esc(item.ticker)}</span>` : ""}
        </div>
        <button class="fav-remove" type="button" data-fav-remove="${esc(item.key)}" aria-label="관심 종목 제거" title="제거">★</button>
      </div>
      <div class="fav-body" data-fav-body="${esc(item.key)}">
        <div class="fav-loading"><span class="spinner spinner-sm"></span> AI 분석 불러오는 중…</div>
      </div>
    </article>`;
  }

  function miniList(arr) {
    return list(arr).length
      ? `<ul class="mini-list">${list(arr).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "";
  }

  /** Render the analysis content into a favorite card body. */
  function analysisBody(a) {
    if (!a) return analysisError(false);
    const t = a.trend || {};
    return `
      ${has(a.summary) ? `<p class="fav-summary">${esc(a.summary)}</p>` : ""}
      <div class="fav-trend">
        ${sparkline(t.points, t.direction)}
        <div class="fav-trend-meta">
          ${badge(t.change, t.direction)}
          ${has(t.period) ? `<span class="fav-period">${esc(t.period)}</span>` : ""}
          ${has(a.price) ? `<span class="fav-price">${esc(a.price)}</span>` : ""}
        </div>
      </div>
      ${has(a.momentum) ? `<p class="fav-line"><b>모멘텀</b> ${esc(a.momentum)}</p>` : ""}
      <div class="fav-cols">
        ${list(a.catalysts).length ? `<div class="fav-col"><h4 class="fav-h4 h4-up">상승 촉매</h4>${miniList(a.catalysts)}</div>` : ""}
        ${list(a.risks).length ? `<div class="fav-col"><h4 class="fav-h4 h4-down">리스크</h4>${miniList(a.risks)}</div>` : ""}
      </div>
      ${has(a.outlook_short) ? `<p class="fav-line"><b>단기</b> ${esc(a.outlook_short)}</p>` : ""}
      ${has(a.outlook_mid) ? `<p class="fav-line"><b>중기</b> ${esc(a.outlook_mid)}</p>` : ""}
      ${has(a.valuation) ? `<p class="fav-line"><b>밸류</b> ${esc(a.valuation)}</p>` : ""}
      ${has(a.stance) ? `<div class="fav-stance">AI 투자 의견 · <b>${esc(a.stance)}</b></div>` : ""}`;
  }

  function analysisError(needsKey) {
    const hint = needsKey
      ? "Gemini API 키 설정이 필요합니다."
      : "AI 사용량·결제 한도 또는 일시적 오류일 수 있어요.";
    return `<div class="fav-error">
      <span class="fav-error-msg">⚠ AI 분석을 불러오지 못했습니다.</span>
      <span class="fav-error-hint">${esc(hint)}</span>
      <button class="fav-retry" type="button">다시 시도</button>
    </div>`;
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
      marketPulse(b) +
      keyIssues(b.key_issues) +
      favSection() +
      recoSection() +
      domestic(b.domestic) +
      overseas(b.overseas) +
      aiStocks(b.ai_stocks) +
      macro(b.macro) +
      strategy(b.strategy) +
      footer(b)
    );
  }

  window.StockFinderRender = Object.freeze({
    renderBriefing,
    recoCards,
    recoSummary,
    favCard,
    analysisBody,
    analysisError,
    esc,
  });
})();
