// supabase/functions/analyze-company/index.ts
//
// On-demand AI analysis for a single company (favorited by the user).
// Uses Gemini + Google Search grounding, caches the result per (company, day).
//
// Request:  POST { company: string, ticker?: string, market?: "KR"|"US" }
//           or GET ?q=삼성전자&ticker=005930
// Response: { ok: true, cached: bool, data: {...} } | { ok: false, error, needs_key? }
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional),
//      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected).
// Deployed with verify_jwt = false; bounded by a 12h cache freshness check.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TABLE = "stock_finder_company_analysis";
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function kstDate(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizeKey(company: string, ticker?: string): string {
  return `${(ticker || "").trim()}|${company.trim()}`.toLowerCase();
}

function extractJson(text: string): Record<string, unknown> {
  if (!text || !text.trim()) throw new Error("empty model response");
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found");
  }
  return JSON.parse(t.slice(start, end + 1));
}

function buildPrompt(company: string, ticker: string, market: string, date: string): string {
  const label = ticker ? `${company}(${ticker})` : company;
  return `당신은 한국·미국 주식을 분석하는 전문 애널리스트입니다.
Google 검색으로 "${label}" 종목의 **최신 시세·뉴스·추이**를 수집하여 ${date} 기준 심층 분석을 작성하세요.

[규칙]
- 반드시 **검색으로 확인한 실제 데이터**만 사용하고, 모르는 값은 "-" 로 표기합니다.
- 모든 텍스트는 **한국어**, 출력은 **오직 하나의 JSON 객체**만 (마크다운/설명 금지).
- trend.points 는 최근 거래일 **종가 7~10개**를 시간 오름차순으로 담습니다(스파크라인용).
- 숫자(가격)는 단위 포함 문자열, points의 v는 숫자만.
- direction/stance 는 지정된 값 중 하나만 사용합니다.

[출력 JSON 스키마]
{
  "company": "${company}",
  "ticker": "${ticker || "-"}",
  "market": "${market || "-"}",
  "as_of": "${date}",
  "price": "현재가(단위 포함, 예: 354,500원 / $216.34)",
  "summary": "투자 관점 한 줄 핵심 요약",
  "trend": {
    "direction": "up|down|flat",
    "period": "예: 최근 1개월",
    "change": "기간 등락 (+/-%)",
    "points": [ { "t": "5/30", "v": 354500 } ]
  },
  "momentum": "최근 수급·모멘텀 1~2문장",
  "catalysts": ["상승 촉매 1", "상승 촉매 2"],
  "risks": ["리스크 1", "리스크 2"],
  "outlook_short": "단기(1~4주) 전망",
  "outlook_mid": "중기(1~3개월) 전망",
  "valuation": "밸류에이션/실적 코멘트",
  "stance": "적극매수|매수|중립|관찰|비중축소",
  "disclaimer": "본 분석은 자동 수집된 공개 데이터 기반 참고 자료이며 투자 권유가 아닙니다."
}`;
}

async function callGemini(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p?.text ?? "").join("").trim();
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned no text (finishReason=${reason})`);
  }
  return { text, model };
}

async function getCached(baseUrl: string, key: string, serviceKey: string, date: string) {
  const url =
    `${baseUrl}/rest/v1/${TABLE}?company_key=eq.${encodeURIComponent(key)}` +
    `&analysis_date=eq.${date}&select=generated_at,data&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsert(baseUrl: string, serviceKey: string, row: Record<string, unknown>) {
  const url = `${baseUrl}/rest/v1/${TABLE}?on_conflict=company_key,analysis_date`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`DB upsert failed ${res.status}: ${detail.slice(0, 300)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) {
    return json({ ok: false, error: "Supabase env not configured" }, 500);
  }

  // Parse input from query or body.
  let company = "";
  let ticker = "";
  let market = "";
  try {
    const url = new URL(req.url);
    company = url.searchParams.get("q") || url.searchParams.get("company") || "";
    ticker = url.searchParams.get("ticker") || "";
    market = url.searchParams.get("market") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      company = body.company || company;
      ticker = body.ticker || ticker;
      market = body.market || market;
    }
  } catch {
    /* ignore */
  }
  company = String(company || "").trim();
  if (!company) return json({ ok: false, error: "company is required" }, 400);

  const date = kstDate();
  const key = normalizeKey(company, ticker);

  try {
    // 1) Freshness cache check.
    const cached = await getCached(baseUrl, key, serviceKey, date);
    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < FRESH_WINDOW_MS) {
        return json({ ok: true, cached: true, data: cached.data });
      }
    }

    // 2) Generate via Gemini grounding.
    const { text, model } = await callGemini(buildPrompt(company, ticker, market, date));
    const analysis = extractJson(text);
    analysis.company = analysis.company || company;
    if (ticker) analysis.ticker = analysis.ticker || ticker;

    // 3) Cache.
    await upsert(baseUrl, serviceKey, {
      company_key: key,
      company,
      ticker: ticker || null,
      market: market || null,
      analysis_date: date,
      generated_at: new Date().toISOString(),
      model,
      data: analysis,
    });

    return json({ ok: true, cached: false, data: analysis });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("GEMINI_API_KEY_MISSING")) {
      return json(
        { ok: false, needs_key: true, error: "GEMINI_API_KEY가 설정되지 않았습니다." },
        200,
      );
    }
    console.error("analyze-company failed:", err);
    return json({ ok: false, error: msg }, 500);
  }
});
