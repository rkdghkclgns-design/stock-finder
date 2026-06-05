// assets/api.js
// Thin data layer over the Supabase REST API. No mutation of inputs.

const CACHE_KEY = "stock_finder:last_briefing";

function cfg() {
  const c = window.STOCK_FINDER_CONFIG;
  if (!c || !c.SUPABASE_URL || !c.SUPABASE_KEY) {
    throw new Error("STOCK_FINDER_CONFIG is missing. Check assets/config.js.");
  }
  return c;
}

/** Fetch the most recent briefing row from Supabase. */
async function fetchLatestBriefing() {
  const c = cfg();
  const url =
    `${c.SUPABASE_URL}/rest/v1/${c.TABLE}` +
    `?select=briefing_date,generated_at,source,model,data` +
    `&order=briefing_date.desc&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: c.SUPABASE_KEY,
      Authorization: `Bearer ${c.SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status}).`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("아직 발행된 브리핑이 없습니다.");
  }
  return rows[0];
}

/** Trigger a server-side regeneration (requires ADMIN_SECRET configured). */
async function triggerRefresh() {
  const c = cfg();
  if (!c.ADMIN_SECRET) {
    throw new Error("ADMIN_SECRET이 설정되어 있지 않습니다.");
  }
  const url = `${c.SUPABASE_URL}/functions/v1/generate-briefing?force=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": c.ADMIN_SECRET,
    },
    body: JSON.stringify({ source: "manual-web" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `갱신 실패 (HTTP ${res.status}).`);
  }
  return body;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(row) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(row));
  } catch {
    /* storage may be unavailable (private mode); ignore. */
  }
}

window.StockFinderApi = Object.freeze({
  fetchLatestBriefing,
  triggerRefresh,
  readCache,
  writeCache,
});
