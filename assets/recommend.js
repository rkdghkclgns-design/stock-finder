// assets/recommend.js
// Transparent, client-side recommendation engine. Derives ranked investment
// ideas from the briefing's structured fields (AI stocks + strategy + targets).
// Pure functions, no mutation of inputs. NOT investment advice — see disclaimer.

(function () {
  "use strict";

  const PROFILES = [
    { id: "stable", label: "안정형", desc: "변동성 낮은 대형주 위주" },
    { id: "balanced", label: "중립형", desc: "위험과 수익의 균형" },
    { id: "aggressive", label: "공격형", desc: "고수익 기대 종목 위주" },
  ];

  // Mega-cap names treated as relatively lower risk when no other signal exists.
  const BLUE_CHIPS = ["NVDA", "MSFT", "GOOGL", "AAPL", "AMZN", "TSM"];

  // ---- parsing (shared via window.SF) ---------------------------------------

  const parseMoney = window.SF.parseMoney;
  const parsePct = window.SF.parsePct;

  function includesAny(hay, needles) {
    if (!hay) return false;
    return needles.some((n) => n && hay.includes(n));
  }

  // ---- context (cross-section signals) --------------------------------------

  function buildContext(data) {
    const d = data || {};
    const s = d.strategy || {};
    const short = (s.short_term || []).join(" ");
    const mid = (s.mid_term || []).join(" ");
    const inv = (d.domestic || {}).investors || {};
    return {
      short,
      mid,
      topBuy: (inv.top_buys || []).map((b) => b.name).filter(Boolean),
      targets: (d.domestic || {}).target_prices
        ? d.domestic.target_prices.map((t) => t.stock).filter(Boolean)
        : [],
    };
  }

  // ---- per-stock scoring -----------------------------------------------------

  function evalStock(stock, market, ctx) {
    const name = stock.name || stock.ticker || stock.code || "";
    const id = stock.ticker || stock.code || "";
    const names = [name, id].filter(Boolean);

    const current = parseMoney(stock.price);
    const buyMid = parseMoney(stock.buy);
    const sellMid = parseMoney(stock.sell);
    const ref = current != null ? current : buyMid;
    const expReturn =
      ref != null && sellMid != null && ref > 0
        ? ((sellMid - ref) / ref) * 100
        : null;

    const changePct = parsePct(stock.change);
    const cap = stock.market_cap || "";
    const text = `${stock.reason || ""} ${stock.note || ""} ${cap}`;

    const inShort = includesAny(ctx.short, names);
    const inMid = includesAny(ctx.mid, names);
    const isTopBuy = ctx.topBuy.some((n) => n && (n.includes(name) || name.includes(n)));
    const isTarget = ctx.targets.some((n) => n && (n.includes(name) || name.includes(n)));

    // Conviction score → 3 강력추천 / 2 추천 / 1 관심
    let score = 0;
    if (isTopBuy) score += 2;
    if (inShort || inMid) score += 2;
    if (isTarget) score += 1;
    if (stock.direction === "up" && (changePct == null || changePct >= 0)) score += 1;
    if (expReturn != null && expReturn >= 10) score += 1;
    if (stock.target && stock.target !== "-") score += 1;
    const conviction = score >= 4 ? 3 : score >= 2 ? 2 : 1;

    // Risk level
    const bigSwing = changePct != null && Math.abs(changePct) >= 8;
    const highRiskText = /변동성|주의|고평가|급등|급락|소형|중형/.test(text);
    const lowRiskBase = /대형|조/.test(cap) || (market === "US" && BLUE_CHIPS.includes(id));
    let risk = "mid";
    if ((bigSwing || highRiskText) && !lowRiskBase) risk = "high";
    else if (lowRiskBase && !bigSwing) risk = "low";

    const action = conviction >= 3 ? "적극 매수" : conviction === 2 ? "분할 매수" : "관심 관찰";
    const horizon = inShort ? "단기" : "중기";

    return {
      name,
      id,
      market, // 'KR' | 'US'
      price: stock.price,
      entry: stock.buy,
      target: stock.sell,
      targetPrice: stock.target,
      expReturn,
      changePct,
      direction: stock.direction || "flat",
      conviction,
      risk, // 'low' | 'mid' | 'high'
      action,
      horizon,
      reason: stock.reason || stock.note || "",
    };
  }

  // ---- public API ------------------------------------------------------------

  function byConvictionThenReturn(a, b) {
    return b.conviction - a.conviction || (b.expReturn ?? -999) - (a.expReturn ?? -999);
  }

  /** Build the full ranked recommendation list from briefing data. */
  function build(data) {
    const ai = (data || {}).ai_stocks || {};
    const ctx = buildContext(data);
    const recs = []
      .concat((ai.kr || []).map((s) => evalStock(s, "KR", ctx)))
      .concat((ai.us || []).map((s) => evalStock(s, "US", ctx)));
    return recs.sort(byConvictionThenReturn);
  }

  /** Filter + sort the recommendations for a given investor profile. */
  function filter(recs, profileId, limit = 6) {
    const all = (recs || []).slice();
    let pool;
    if (profileId === "stable") {
      const low = all.filter((r) => r.risk === "low");
      const nonHigh = all.filter((r) => r.risk !== "high");
      pool = (low.length >= 3 ? low : nonHigh.length ? nonHigh : all).sort(
        byConvictionThenReturn
      );
    } else if (profileId === "aggressive") {
      pool = all.sort(
        (a, b) => (b.expReturn ?? -999) - (a.expReturn ?? -999) || b.conviction - a.conviction
      );
    } else {
      // balanced
      pool = all.filter((r) => r.risk !== "high").sort(byConvictionThenReturn);
      if (pool.length < 3) pool = all.slice().sort(byConvictionThenReturn);
    }
    return pool.slice(0, limit);
  }

  window.StockFinderRecommend = Object.freeze({ PROFILES, build, filter });
})();
