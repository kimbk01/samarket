# 요청 예산 계약 (SSOT)

- 근거: `docs/audit/supabase-request-surge-2026-11-18/root-cause-design.md`(원인 분해), `fundamental-countermeasure-design.md`(대책)
- 목적: Supabase 요청 급증(11-08·11-18)이 다시 날 때 **Owner 가 대시보드로 발견하기 전에** 운영 데이터로 자동 감지한다.

## 1. 구성 (운영에 들어가는 것)

| 구성 | 파일 | 하는 일 |
|---|---|---|
| 예산 표 | `lib/perf/request-budget.ts` | 라우트별 「요청 1회당 Supabase 호출」 상한(운영 측정값), 경보 배수 |
| 시험 표지 | `lib/perf/test-traffic.ts` | 사무실 시험 기기 UA·시험 계정 목록 |
| 호출 계수기 | `lib/perf/supabase-call-counter.ts` · `lib/perf/install-supabase-call-counter.server.ts` · `instrumentation.ts` | 운영 서버 fetch 를 감싸 Supabase 호출을 라우트별로 세고 5분마다 `cm_monitoring_rollup_hourly` 에 저장 |
| 하루 감시 | `app/api/cron/request-budget-watch` · `lib/perf/request-budget-watch*.ts` · `lib/perf/request-budget-vercel-usage.server.ts` · `vercel.json` (`0 1 * * *` = 09:00 PHT) | 직전 하루를 예산과 비교, 넘친 경우에만 관리자 알림 1건. 판정 측정은 아래 「2-1」 |
| 매시 이상 감시 (D4 · 2026-11-26 Owner 「순서 승인」) | `app/api/cron/hourly-anomaly-watch` · `lib/perf/hourly-anomaly-watch*.ts` · `vercel.json` (`7 * * * *`) | 직전 1시간: ① 플랫폼별 실시간 재시도 ≥200 이고 성공의 3배 이상(`realtime.subscription` 집계, 토큰 불필요) ② 방 경로 1개 요청 ≥120/h(Vercel `request_path`, `VERCEL_OBSERVABILITY_TOKEN` 필요 — 없으면 건너뜀). 이상 시 관리자 알림, 대상별 하루 1건. 요청당 비용 감시가 못 잡는 「요청 수만 느는 반복」용 |

## 2-1. 판정 측정 (2026-11-26 · Owner 「C·D 승인」)

- **환경변수 `VERCEL_OBSERVABILITY_TOKEN` 이 있으면** 라우트 1회당·하루 합계는 **Vercel 관측**으로 판정한다 — 예산 값을 정한 측정과 같다.
  - 창: 직전 **UTC 하루**(08:00~08:00 PHT). 호출 = `external_api_request`(Supabase 호스트) `origin_route` 별, 요청 = `request.count` `route` 별. `/_middleware` = `unknown`.
  - 하루 합계 비교 = 그 전 7일 Vercel 하루 합계 중앙값. 시험 기기 호출 수(참고 표시)만 계수기 값.
  - 알림 본문 앞에 `[vercel]` 이 붙는다.
- **토큰이 없거나 Vercel 조회·해석이 실패하면** 지금처럼 계수기(§2)로 판정하고 본문 앞에 `[counter]`. 실패는 로그 `vercel_usage_failed` 1줄.
- 계수기는 표·함수 분해 용도로 남는다(라우트 판정 기준 아님). 근거: 계수기는 인스턴스 정지 때 마지막 셈을 잃고(저장 42~85%), 분모가 Supabase 를 부른 요청뿐이다 — `docs/audit/supabase-request-surge-2026-11-18/budget-alert-final-2026-11-26.md` §1 D1·D2.
- 토큰: Owner 가 Vercel 에서 만들고 운영 환경변수로 등록(작업자는 만들거나 보지 않는다). 읽기 전용 범위·만료일 지정 권장.

## 2. 집계 키 (`cm_monitoring_rollup_hourly`, platform=`unknown`)

| category | metric | event_count | value_count | value_max |
|---|---|---|---|---|
| `server.supabase_route` | 라우트(`/api/a/[id]/b` → `api.a.:id.b`, 저장소 밖 호출 = `unknown`) | 호출 수 | 요청 수 | 요청 1회 최대 호출 |
| `server.supabase_route_test` | 위와 같음 — 시험 기기 UA | 〃 | 〃 | 〃 |
| `server.supabase_target` | `rest.<표>`·`rpc.<함수>`·`auth.<경로>`·`storage`·`realtime` | 호출 수 | 0 | — |
| `server.supabase_route_units` | 표지 붙은 라우트(`…::post`) | 단위 합(보내기 = 받는 사람 수) | 0 | — |
| `server.supabase_route_target` | `<표지 붙은 라우트>::<rest.표·rpc.함수…>` (96자) | 그 요청들의 표별 호출 수 | 0 | — |

- **요청 표지 (2026-11-22)**: Next 요청 저장소에는 요청 방식이 없어 계수기가 GET·POST 를 스스로 나누지 못한다. 핸들러 첫 줄 `tagSupabaseCallRequest("post")` 로 표지를 달면 그 요청(응답 뒤 `after()` 포함 — 같은 저장소)은 `<라우트>::post` 로 센다. 지금 표지: 메시지 라우트 POST(보내기) 1곳. 받는 사람 수는 `addSupabaseCallRequestUnits(n)`.
  집계 함수가 metric `^[a-z0-9_.:-]{1,96}$` 만 받아 구분자는 `::`. 예산 표 키는 `"/api/…/messages@post"` 로 쓰고 같은 규칙으로 바꿔 비교한다.
  분리 뒤 표지 없는 메시지 키(GET)는 보내기가 빠져 1회당 값이 내려간다 — 실제 감소가 아니라 분리 때문이다(2026-11-22 이전 값과 비교 금지).

- `value_count`(요청 수)는 **Supabase 를 1번 이상 부른 요청**만 센다(계수기는 fetch 만 본다). 예산 초깃값은 Vercel 「모든 요청」 기준이라 정의가 다르지만,
  2026-11-19 00~12 UTC 실측에서 8개 예산 라우트의 1회당 값이 Vercel 과 10% 안으로 같았다(거의 모든 요청이 Supabase 를 부름). 캐시만으로 끝나는 요청이 많은 라우트를 새로 예산에 넣을 때는 이 차이를 확인한다.
- 계수기는 인스턴스가 멈추면 마지막 전송 전 셈을 잃는다. **2026-11-22 실측(7일): 저장분 = Vercel 호출의 9~58%(라우트마다 다름), 남은 표본의 1회당 값이 Vercel 보다 1.07~2.5배 높았다** — 「1회당 판정에 영향 없음」이 틀렸다. 원인 일부: 5분 타이머 전송이 요청과 묶이지 않아 인스턴스 정지로 끊김(`rollup_failed fetch failed`) → 2026-11-22 전송을 그 요청의 `after()` 로 묶음. 근거 `docs/audit/supabase-request-surge-2026-11-18/budget-alert-7-routes-and-counter-loss-2026-11-22.md`.
- **경보가 오면 먼저 같은 24시간의 Vercel 1회당(`external_api_request` Supabase ÷ `request.count`)으로 대조한다.** 예산 값은 Vercel 기준으로 정했다.

## 3. 경보 기준

| 경보 | 기준 |
|---|---|
| `route_over_budget` | 예산 라우트의 24시간 1회당 호출 > 예산 × 1.2 (요청 30회 이상인 라우트만) |
| `route_over_budget` (단위 예산) | `ROUTE_SUPABASE_CALL_UNIT_BUDGET` 키: 24시간 호출 > (요청 1번당 × 요청 + 단위 1개당 × 단위 합) × 1.2. 값은 7일 실측 뒤 넣는다(지금 비어 있음 → `unbudgeted_route` 판정) |
| `unbudgeted_route` | 예산 없는 라우트가 24시간 1,000건 이상 |
| `daily_total` | 24시간 합계(시험 기기 제외) > 직전 7일 하루 합계 중앙값 × 1.5 |
| `counter_silent` | 24시간 합계 0건 — 계수기·저장 고장 |

알림: 관리자 알림 `request_budget_alert`(활성 관리자 전원, 푸시 포함), 하루 1건(`request_budget_alert:<PHT 날짜>`).

## 4. 규칙

1. 예산 값은 **내리기만** 한다. 호출을 줄인 PR 이 같은 PR 에서 값을 낮춘다. 올리려면 Owner 승인.
2. 하루 Supabase 1,000건 이상을 부르는 새 API 라우트는 예산 표에 항목을 추가한다(없으면 `unbudgeted_route` 경보).
3. 경보가 오면 원인을 이 집계(라우트·대상 표·시험 기기)로 먼저 나누고 보고한다 — 추측 금지.
4. 계수기 끄기(긴급): Vercel 환경변수 `SUPABASE_CALL_COUNTER=0` (Owner 승인 후 재배포).
5. 고객센터 (2026-11-28 최종 감사 L10): `/api/support/cases` 3.0 — 목록(로그인 확인 1 + 목록 1 + 첫 페이지 개수 1) · FAB 숫자 `?summary=unread`(2, 클라이언트 5초 캐시·요청 공유). 코드 계산값, 7일 뒤 Vercel 값으로 내리기만.
   - 2026-11-28 최종 점검 L12 (코드 계산값 · 응답 뒤 어드민 알림은 support 어드민 수 비례라 제외 — 측정 뒤 단위 예산 대상): `/api/support/cases/[caseId]` 7.0 (상세 GET 4~7 · 「확인했어요」 7 · 추가 문의 4) · `/api/support/cases/open` 11.0 (새 문의 9~11 · 진행 중 문의에 붙음 6~9) · `/api/admin/support/cases` 12.0 (권한 2 + 목록 1(+검색 2) + 탭 숫자 5 + 표시 이름 1~2) · `/api/admin/support/cases/[caseId]` 13.0 (GET 10~12 · 답변 12~13 · 종료 8 · 답변 삭제 최대 17 드묾). 계산 내역은 `lib/perf/request-budget.ts` 주석.
   - 2026-11-29 고객센터 전체 수정 (계약 §1·§2·§3 · 코드 계산값): `/api/support/cases/open` **11.0 → 7.0** (접수 = DB 함수 1번 · 4~7) · `/api/support/cases/[caseId]` 7.0 유지 (상세 GET 읽기만 3~4 · 새 `seen` 4~8 은 GET 이 `needsSeen=true` 일 때만 · 「확인했어요」 4~6 · 추가 문의 5) · `/api/admin/support/cases/[caseId]` 13.0 유지 (GET 읽기만 6~7 · `seen` 7~8 · 종료 7 · 답변 보통 15 · 답 쓰는 사이 고객 글이 오면 18~19 · 알림 저장 실패 시 최대 21 — 고객 알림 행 저장이 응답 전으로 와 답변만 늘었다. 열람(GET+seen)이 답변보다 잦아 평균은 내려간다고 계산 · 7일 뒤 Vercel 값으로 확인, 넘으면 Owner 보고). 계산 내역은 `lib/perf/request-budget.ts` 주석.
   - 2026-11-29 다시 셈 `/api/support/cases` 3.0 유지: FAB 숫자 회원 2 · 사장님 2~3(A-6 매장 소유 확인 · 5초 캐시) · 쓰기 창 진행 중(`limit` 만 · 개수 안 셈) 2~3 · 「내 문의」 첫 페이지 3~5. **사장님 「내 문의」 첫 페이지 4~5 는 예산을 넘는다** — 평균은 안이라고 계산했으나 측정 안 함(NOT_PROVEN). 7일 뒤 Vercel 값이 3.6 을 넘으면 Owner 보고.

## 5. 한계 (알고 쓰는 것)

- 서버리스 인스턴스가 멈추면 마지막 저장 뒤 셈(최대 5분)은 잃는다 → 절대값보다 1회당 호출·전일 대비 배수로 판정한다.
- 미들웨어(`proxy.ts`)·요청 저장소 밖 호출은 `unknown` 으로만 잡힌다(총량 경보에는 포함).
- 앱이 Supabase 를 직접 부르는 호출(Realtime·Storage·브라우저 클라이언트)은 서버 계수기에 잡히지 않는다.
- CI 단계에서 라우트 호출 수를 막는 검사는 없다. 가짜 빈 데이터로는 운영 호출 수를 재현하지 못해(측정: 방 메시지 운영 10.6 → 가짜 3) 넣지 않았다. 감지는 운영 감시가 맡는다.
