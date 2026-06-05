# 📈 주식 시장 일일 브리핑 (Stock Finder)

매일 **오전 8시(KST)** 자동으로 갱신되는 한국·미국 주식 시장 일일 브리핑 웹앱입니다.
모바일 반응형으로 제작되었으며, **Supabase Edge Function**을 통해 **Google Gemini API + 검색 그라운딩**으로
실시간 시장 데이터를 수집·요약합니다.

🔗 **배포 URL**: https://rkdghkclgns-design.github.io/stock-finder/

> ⚠️ **투자 유의** — 본 브리핑은 자동 수집된 공개 데이터 기반의 참고 자료입니다.
> 투자 결정의 최종 책임은 투자자 본인에게 있습니다.

---

## 🏗️ 아키텍처

```
┌────────────────────┐      매일 23:00 UTC (08:00 KST)
│  pg_cron (스케줄러) │──────────────┐
└────────────────────┘              │ net.http_post
                                     ▼
                       ┌──────────────────────────────┐
                       │ Edge Function                 │
                       │  generate-briefing            │
                       │  1. 오늘 브리핑 신선도 확인    │
                       │  2. Gemini + Google Search 호출│
                       │  3. JSON 브리핑 생성·저장      │
                       └───────────────┬───────────────┘
                                       │ upsert (service role)
                                       ▼
                       ┌──────────────────────────────┐
                       │ Postgres                      │
                       │  public.stock_finder_briefings│  ← RLS: 공개 읽기 전용
                       └───────────────┬───────────────┘
                                       │ REST (publishable key, 읽기)
                                       ▼
                       ┌──────────────────────────────┐
                       │ 모바일 웹 (GitHub Pages)      │
                       │  index.html + assets/*        │
                       └──────────────────────────────┘
```

- **데이터 소스**: Google Gemini API (`gemini-2.5-flash`) + Google Search 그라운딩
- **백엔드**: Supabase Edge Function (Deno) + Postgres + pg_cron/pg_net
- **프론트엔드**: 정적 HTML/CSS/JS (프레임워크 無), GitHub Pages 호스팅
- **Supabase 프로젝트**: `joha-gallery` (ref: `etasxbaorwgjoofdxean`) — 기존 프로젝트에
  `stock_finder_` 네임스페이스로 **격리** 추가 (무료 프로젝트 2개 한도 때문)

---

## ⚙️ 필수 설정 — Gemini API 키 & 결제 크레딧

자동 갱신과 AI 분석이 동작하려면 Edge Function에 **`GEMINI_API_KEY`** 시크릿이 필요합니다.

> 🔴 **현재 상태**: 키는 등록되어 있으나 Gemini 프로젝트의 **결제 크레딧이 소진**되어
> (`429 RESOURCE_EXHAUSTED`) AI 생성·분석 호출이 실패합니다.
> [AI Studio → Billing](https://ai.studio/projects) 에서 크레딧을 충전하면 **즉시 정상 동작**합니다.
> (그동안 브리핑은 마지막 정상 데이터/시드를, 관심 종목 분석은 안내 메시지를 표시합니다.)

### 1) Gemini API 키 발급
- https://aistudio.google.com/app/apikey 에서 무료 발급

### 2) Supabase에 시크릿 등록 — 둘 중 하나

**(A) 대시보드**
1. https://supabase.com/dashboard/project/etasxbaorwgjoofdxean/settings/functions
2. **Edge Functions → Secrets** 에서 추가:
   - `GEMINI_API_KEY` = `발급받은 키`
   - (선택) `GEMINI_MODEL` = `gemini-2.5-flash` (기본값)
   - (선택) `ADMIN_SECRET` = `임의의 긴 문자열` ← 웹의 "지금 갱신" 버튼/강제 갱신용

**(B) Supabase CLI**
```bash
supabase secrets set GEMINI_API_KEY=발급받은_키 --project-ref etasxbaorwgjoofdxean
# 선택
supabase secrets set ADMIN_SECRET=임의의_긴_문자열 --project-ref etasxbaorwgjoofdxean
```

### 3) (선택) 즉시 생성 테스트
`ADMIN_SECRET`을 등록했다면 강제 갱신으로 바로 테스트할 수 있습니다:
```bash
curl -X POST "https://etasxbaorwgjoofdxean.supabase.co/functions/v1/generate-briefing?force=true" \
  -H "x-admin-secret: 등록한_ADMIN_SECRET"
```
등록하지 않았다면, 다음 날 08:00 KST 크론이 새 날짜(데이터 없음)에 대해 자동 생성합니다.

---

## 🔄 자동 갱신 동작 방식

- **스케줄**: `pg_cron` 잡 `stock-finder-daily-briefing` → 매일 `0 23 * * *` (UTC) = **08:00 KST**
- Edge Function은 **하루 1회만** Gemini를 호출합니다(신선도 6시간 캐시). 같은 날 중복 호출 시
  이미 생성된 브리핑을 그대로 반환해 비용을 아낍니다.
- 강제 재생성(`?force=true`)은 `ADMIN_SECRET`이 있을 때만 허용됩니다.

크론 상태 확인(SQL):
```sql
select jobname, schedule, active from cron.job where jobname = 'stock-finder-daily-briefing';
select * from cron.job_run_details order by start_time desc limit 5;
```

---

## 🖥️ 로컬 미리보기

```bash
npx http-server . -p 4321 -c-1
# 브라우저에서 http://localhost:4321
```
프론트엔드는 배포된 Supabase REST에서 최신 브리핑을 읽어오므로 로컬에서도 실제 데이터가 보입니다.

---

## 🚀 GitHub Pages 배포

이 저장소는 GitHub Pages(루트 `/`)로 서빙됩니다 → **https://rkdghkclgns-design.github.io/stock-finder/**
변경 후 푸시하면 자동 반영됩니다.
```bash
git add -A && git commit -m "update" && git push
```

---

## 📁 디렉터리 구조

```
.
├── index.html                  # 진입점
├── assets/
│   ├── config.js               # Supabase URL + publishable key (공개)
│   ├── util.js                 # 공용 파싱·차트 기하 헬퍼 (window.SF)
│   ├── api.js                  # REST 데이터 레이어 + 자동갱신/분석 호출 + 캐시
│   ├── favorites.js            # 관심 종목 상태 (localStorage)
│   ├── recommend.js            # 투자 추천 엔진 (기대수익·확신도·리스크 산출)
│   ├── render.js               # JSON → HTML 렌더링 (시각화·XSS 이스케이프)
│   ├── app.js                  # 부트스트랩·네비·추천·관심종목·자동갱신·스크롤 복원
│   └── styles.css              # 모바일 우선 다크 테마 (상승=빨강/하락=파랑)
├── supabase/
│   ├── functions/
│   │   ├── generate-briefing/index.ts   # 일일 브리핑 생성 (Gemini 그라운딩)
│   │   └── analyze-company/index.ts     # 관심 종목 AI 분석 (Gemini 그라운딩)
│   └── migrations/
│       ├── ...briefings_table.sql
│       ├── ...daily_cron.sql
│       └── ...company_analysis_table.sql
└── README.md
```

## 💡 투자 추천 기능
- **투자 성향**(안정형/중립형/공격형)을 선택하면 그날 브리핑 데이터를 분석해 종목을 추천합니다.
- 각 종목의 **기대 수익률**(현재가→목표가), **확신도**(강력추천/추천/관심), **리스크**(낮음/중간/높음),
  **보유 기간**(단기/중기)을 자동 산출합니다. 산출 로직은 `assets/recommend.js`에 투명하게 구현되어 있습니다.
- 선택한 성향은 브라우저에 저장(localStorage)되어 재방문 시 유지됩니다.
- ⚠️ 자동 계산된 **참고 지표**이며 투자 권유가 아닙니다.

## ⭐ 관심 종목 AI 분석
- 종목 카드의 **☆** 를 누르거나 검색창에 종목명을 입력해 관심 종목을 추가합니다.
- 추가하면 `analyze-company` Edge Function이 **Gemini + 검색 그라운딩**으로 해당 종목을 분석해
  **최근 추이(스파크라인)**, 등락, 모멘텀, 상승 촉매, 리스크, 단기/중기 전망, AI 투자 의견을 보여줍니다.
- 분석 결과는 (종목, 날짜) 단위로 DB에 캐시되어 12시간 내 재요청 시 재생성하지 않습니다.
- 관심 목록은 localStorage에 저장됩니다. (크레딧 소진 시 안내 메시지 + 다시 시도 버튼 표시)

## 🔁 자동 갱신 & 새로고침
- 페이지를 열거나 새로고침하면 최신 브리핑을 즉시 표시하고, 백그라운드에서 `generate-briefing`을
  호출해 **현재 시점**으로 맞춥니다(신선도 6시간 가드 → 불필요한 호출/비용 없음).
- 새로고침 시 **이전에 보던 스크롤 위치를 복원**합니다(sessionStorage).

## 📊 시각화
- 상단 **마켓 펄스**(주요 지수 타일 + 시장 방향 배너)
- AI 종목 카드의 **매수~목표가 게이지**(현재가 위치 표시)
- 추천 카드의 **기대수익 막대**, 관심 종목 **추이 스파크라인**

## 🎨 디자인 메모
- **색상 규칙(국내 관행)**: 상승 🔴 빨강 / 하락 🔵 파랑 / 보합 ⚪ 회색
- 모바일 우선, 상단 섹션 네비게이션(스크롤 스파이 — 네이티브 앵커 기반), 오프라인 캐시 폴백 지원
- 한글 폰트: Pretendard
