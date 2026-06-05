// assets/util.js
// Shared, dependency-free helpers for parsing and lightweight chart geometry.
// Pure functions; no mutation. Exposed as window.SF.

(function () {
  "use strict";

  /** Parse a price/range string → number (mean of a range). Percent strings → null. */
  function parseMoney(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim();
    if (!s || s === "-" || /%/.test(s)) return null;
    const nums = s
      .split(/[~～]/)
      .map((p) => {
        const m = p.replace(/,/g, "").match(/\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      })
      .filter((n) => n !== null && !Number.isNaN(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /** Parse a signed percentage ("+15.06%", "-1.66%") → number. */
  function parsePct(str) {
    if (!str) return null;
    const m = String(str).match(/([+-]?\d+(\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : null;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /**
   * Position of `current` between buy (low) and sell/target (high), as 0..1.
   * Returns null when any value is unparseable.
   */
  function pricePosition(buy, current, sell) {
    const lo = parseMoney(buy);
    const hi = parseMoney(sell);
    const cur = parseMoney(current);
    if (lo === null || hi === null || cur === null || hi === lo) return null;
    return clamp((cur - lo) / (hi - lo), 0, 1);
  }

  /**
   * Build SVG geometry for a sparkline from an array of {v} or numbers.
   * Returns { line, area, up } or null when fewer than 2 numeric points.
   */
  function sparkPath(points, w, h, pad) {
    pad = pad == null ? 2 : pad;
    const nums = (points || [])
      .map((p) => (typeof p === "number" ? p : p && p.v))
      .map((v) => (typeof v === "number" ? v : parseFloat(v)))
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const stepX = (w - pad * 2) / (nums.length - 1);
    const coords = nums.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    const line = coords.join(" ");
    const area = `${pad},${(h - pad).toFixed(1)} ${line} ${(w - pad).toFixed(1)},${(h - pad).toFixed(1)}`;
    return { line, area, up: nums[nums.length - 1] >= nums[0] };
  }

  window.SF = Object.freeze({ parseMoney, parsePct, clamp, pricePosition, sparkPath });
})();
