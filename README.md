# 📈 주식 시장 일일 브리핑 (Stock Finder)

매일 **오전 8시(KST)** 자동으로 갱신되는 한국·미국 주식 시장 일일 브리핑 웹앱입니다.
모바일 반응형으로 제작되었으며, **Supabase Edge Function**을 통해 **Google Gemini API + 검색 그라운딩**으로
실시간 시장 데이터를 수집·요약합니다.

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

## ⚙️ 필수 설정 — Gemini API 키 (1회)

자동 갱신이 동작하려면 Edge Function에 **`GEMINI_API_KEY`** 시크릿을 등록해야 합니다.
(키 등록 전까지는 초기 시드 데이터가 그대로 표시됩니다.)

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

이 저장소는 GitHub Pages(루트 `/`)로 서빙됩니다. 변경 후 푸시하면 자동 반영됩니다.
```bash
git add -A && git commit -m "update" && git push
```
배포 URL은 저장소 **Settings → Pages** 에서 확인하세요.

---

## 📁 디렉터리 구조

```
.
├── index.html                  # 진입점
├── assets/
│   ├── config.js               # Supabase URL + publishable key (공개)
│   ├── api.js                  # REST 데이터 레이어 + localStorage 캐시
│   ├── render.js               # JSON → HTML 렌더링 (XSS 이스케이프)
│   └── styles.css              # 모바일 우선 다크 테마 (상승=빨강/하락=파랑)
├── supabase/
│   ├── functions/
│   │   └── generate-briefing/
│   │       └── index.ts        # Gemini 그라운딩 → 브리핑 생성 Edge Function
│   └── migrations/
│       ├── ...briefings_table.sql
│       └── ...daily_cron.sql
└── README.md
```

## 🎨 디자인 메모
- **색상 규칙(국내 관행)**: 상승 🔴 빨강 / 하락 🔵 파랑 / 보합 ⚪ 회색
- 모바일 우선, 상단 섹션 네비게이션(스크롤 스파이), 오프라인 캐시 폴백 지원
- 한글 폰트: Pretendard
