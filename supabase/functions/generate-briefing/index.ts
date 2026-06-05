// supabase/functions/generate-briefing/index.ts
//
// Daily stock-market briefing generator.
//
// Flow:
//   1. Compute "today" in KST (Asia/Seoul, UTC+9).
//   2. If a fresh briefing for today already exists, return it (no Gemini call) —
//      unless an authorized force-refresh is requested.
//   3. Otherwise call the Gemini API WITH Google Search grounding, asking for a
//      structured JSON briefing built from the latest real-world market data.
//   4. Upsert the result into public.stock_finder_briefings.
//
// Env (Edge Function secrets):
//   GEMINI_API_KEY              (required) Google AI Studio / Gemini API key
//   GEMINI_MODEL                (optional) default "gemini-2.5-flash"
//   ADMIN_SECRET                (optional) if set, enables ?force=true via x-admin-secret header
//   SUPABASE_URL                (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
//
// Deployed with verify_jwt = false so the daily cron can invoke it without a JWT.
// Abuse is bounded by the freshness check (Gemini is only called once per day),
// and force-refresh requires ADMIN_SECRET.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TABLE = "stock_finder_briefings";
const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Current date/weekday in Korea Standard Time. */
function kstNow(): { date: string; weekday: string } {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10), // YYYY-MM-DD
    weekday: WEEKDAYS_KO[shifted.getUTCDay()],
  };
}

/** Robustly pull a JSON object out of an LLM text response. */
function extractJson(text: string): Record<string, unknown> {
  if (!text || !text.trim()) throw new Error("empty model response");
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in model response");
  }
  return JSON.parse(t.slice(start, end + 1));
}

function buildPrompt(date: string, weekday: string): string {
  return `당신은 한국·미국 주식 시장을 매일 분석하는 전문 애널리스트입니다.
Google 검색을 활용해 **실제 최신 데이터**(전일 마감 시세 + 당일 주요 뉴스)를 수집하여,
${date}(${weekday}) 오전 8시 기준 "주식 시장 일일 브리핑"을 작성하세요.

[필수 규칙]
- 반드시 **검색으로 확인한 실제 수치/뉴스**만 사용하고, 모르는 값은 "-" 로 표기합니다.
- 모든 텍스트는 **한국어**로 작성합니다.
- 출력은 **오직 하나의 JSON 객체**만 출력합니다. (마크다운 코드펜스, 설명 문장 금지)
- 숫자는 단위를 포함한 문자열로 표기합니다. 예: "354,500원", "$216.34", "+1.73%".
- direction 필드는 정확히 "up" | "down" | "flat" 중 하나입니다.
- 매수가/매도가(buy/sell)는 기술적·밸류에이션 기반의 참고용 추정 구간입니다.
- AI 관련주는 미국 10~12종목, 한국 8~10종목을 포함합니다.

[출력 JSON 스키마]
{
  "briefing_date": "${date}",
  "weekday": "${weekday}",
  "as_of": "오전 8시",
  "basis": "전일 마감 데이터 + 당일 주요 뉴스 (직접 작성)",
  "key_issues": [ { "title": "핵심 이슈 제목", "body": "2~3문장 설명" } ],
  "domestic": {
    "indices": [ { "name": "KOSPI", "value": "지수값", "change": "+/-%", "direction": "up|down|flat", "note": "비고" } ],
    "note": "국내 시장 종합 코멘트",
    "investors": {
      "foreign": "외국인 동향",
      "institutional": "기관 동향",
      "top_buys": [ { "rank": 1, "name": "종목", "detail": "가격, 등락", "reason": "이유" } ],
      "top_sells": "순매도 상위 종목 요약"
    },
    "sectors": [ { "name": "섹터", "direction": "up|down|flat", "reason": "이유" } ],
    "target_prices": [ { "stock": "종목", "broker": "증권사", "from": "기존", "to": "변경", "direction": "up|down|flat" } ]
  },
  "overseas": {
    "us": [ { "name": "다우존스", "value": "종가", "change": "+/-%", "direction": "up|down|flat", "note": "비고" } ],
    "us_note": "미국 시장 코멘트",
    "asia": [ { "name": "닛케이 225", "value": "종가", "change": "+/-%", "direction": "up|down|flat", "note": "비고" } ],
    "europe": [ { "name": "FTSE 100", "value": "종가", "change": "+/-%", "direction": "up|down|flat", "note": "비고" } ]
  },
  "ai_stocks": {
    "us": [ { "ticker": "NVDA", "name": "엔비디아", "price": "$216", "change": "+/-%", "direction": "up|down|flat", "note": "모멘텀", "buy": "매수 구간", "sell": "매도 구간" } ],
    "kr": [ { "code": "005930", "name": "삼성전자", "price": "354,500원", "change": "+/-%", "direction": "up|down|flat", "market_cap": "시총", "target": "목표가(증권사)", "buy": "매수 구간", "sell": "매도 구간", "reason": "추천 이유" } ],
    "other_themes": [ { "sector": "바이오", "examples": "대표 종목들", "point": "매수·매도 포인트" } ]
  },
  "macro": {
    "forex_commodities": [ { "item": "USD/KRW", "value": "값", "change": "전일 대비", "note": "비고" } ],
    "rates": [ { "country": "미국 (Fed)", "rate": "현재 금리", "last_change": "마지막 변경", "outlook": "전망" } ],
    "events": [ { "time": "시간", "event": "이벤트" } ]
  },
  "strategy": {
    "direction": "시장 방향성 한 줄",
    "direction_note": "부연",
    "rationale": [ "근거1", "근거2" ],
    "short_term": [ "단기 추천 섹터/종목" ],
    "mid_term": [ "중기 추천 섹터/종목" ],
    "cautions": [ "매매 시 주의사항" ],
    "risks": [ { "risk": "리스크명", "detail": "내용" } ]
  },
  "sources": [ { "title": "출처 제목", "url": "https://..." } ],
  "disclaimer": "본 브리핑은 자동 수집된 공개 데이터를 기반으로 작성되었습니다. 투자 결정의 최종 책임은 투자자 본인에게 있으며, 투자 손실에 대한 법적 책임을 지지 않습니다."
}`;
}

interface GeminiResult {
  text: string;
  sources: { title: string; url: string }[];
}

async function callGemini(prompt: string): Promise<GeminiResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 32768 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts
    .map((p: { text?: string }) => p?.text ?? "")
    .join("")
    .trim();

  // Grounding citations (used as a fallback if the model omits "sources").
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c: { web?: { uri?: string; title?: string } }) => ({
      title: c?.web?.title ?? c?.web?.uri ?? "",
      url: c?.web?.uri ?? "",
    }))
    .filter((s: { url: string }) => s.url);

  if (!text) {
    const reason = cand?.finishReason ?? "unknown";
    throw new Error(`Gemini returned no text (finishReason=${reason})`);
  }
  return { text, sources };
}

async function fetchExisting(
  baseUrl: string,
  serviceKey: string,
  date: string,
): Promise<{ generated_at: string } | null> {
  const url =
    `${baseUrl}/rest/v1/${TABLE}?briefing_date=eq.${date}&select=generated_at`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertBriefing(
  baseUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
): Promise<void> {
  const url = `${baseUrl}/rest/v1/${TABLE}?on_conflict=briefing_date`;
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
    throw new Error(`DB upsert failed ${res.status}: ${detail.slice(0, 500)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) {
    return json({ ok: false, error: "Supabase env not configured" }, 500);
  }

  // Parse force-refresh intent (only honored when ADMIN_SECRET is configured).
  const url = new URL(req.url);
  const forceRequested = url.searchParams.get("force") === "true";
  const adminSecret = Deno.env.get("ADMIN_SECRET");
  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  const force = forceRequested && !!adminSecret && providedSecret === adminSecret;

  const { date, weekday } = kstNow();

  try {
    // 1) Freshness check — avoid burning Gemini quota.
    if (!force) {
      const existing = await fetchExisting(baseUrl, serviceKey, date);
      if (existing) {
        const age = Date.now() - new Date(existing.generated_at).getTime();
        if (age < FRESH_WINDOW_MS) {
          return json({
            ok: true,
            status: "cached",
            briefing_date: date,
            generated_at: existing.generated_at,
            note: "Fresh briefing already exists; Gemini not called.",
          });
        }
      }
    }

    // 2) Generate via Gemini + Google Search grounding.
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const { text, sources } = await callGemini(buildPrompt(date, weekday));
    const briefing = extractJson(text) as Record<string, unknown>;

    // Normalize critical fields + grounding fallback for sources.
    briefing.briefing_date = date;
    briefing.weekday = briefing.weekday ?? weekday;
    if (
      !Array.isArray(briefing.sources) ||
      (briefing.sources as unknown[]).length === 0
    ) {
      briefing.sources = sources;
    }

    // 3) Persist.
    await upsertBriefing(baseUrl, serviceKey, {
      briefing_date: date,
      model,
      source: force ? "manual" : "cron",
      data: briefing,
      generated_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      status: "generated",
      briefing_date: date,
      model,
      grounded_sources: sources.length,
    });
  } catch (err) {
    console.error("generate-briefing failed:", err);
    return json(
      { ok: false, briefing_date: date, error: String(err) },
      500,
    );
  }
});
