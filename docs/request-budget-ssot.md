# 요청 예산 계약 (SSOT)

- 근거: `docs/audit/supabase-request-surge-2026-11-18/root-cause-design.md`(원인 분해), `fundamental-countermeasure-design.md`(대책)
- 목적: Supabase 요청 급증(11-08·11-18)이 다시 날 때 **Owner 가 대시보드로 발견하기 전에** 운영 데이터로 자동 감지한다.

## 1. 구성 (운영에 들어가는 것)

| 구성 | 파일 | 하는 일 |
|---|---|---|
| 예산 표 | `lib/perf/request-budget.ts` | 라우트별 「요청 1회당 Supabase 호출」 상한(운영 측정값), 경보 배수 |
| 시험 표지 | `lib/perf/test-traffic.ts` | 사무실 시험 기기 UA·시험 계정 목록 |
| 호출 계수기 | `lib/perf/supabase-call-counter.ts` · `lib/perf/install-supabase-call-counter.server.ts` · `instrumentation.ts` | 운영 서버 fetch 를 감싸 Supabase 호출을 라우트별로 세고 5분마다 `cm_monitoring_rollup_hourly` 에 저장 |
| 하루 감시 | `app/api/cron/request-budget-watch` · `lib/perf/request-budget-watch*.ts` · `vercel.json` (`0 1 * * *` = 09:00 PHT) | 최근 24시간을 예산과 비교, 넘친 경우에만 관리자 알림 1건 |

## 2. 집계 키 (`cm_monitoring_rollup_hourly`, platform=`unknown`)

| category | metric | event_count | value_count | value_max |
|---|---|---|---|---|
| `server.supabase_route` | 라우트(`/api/a/[id]/b` → `api.a.:id.b`, 저장소 밖 호출 = `unknown`) | 호출 수 | 요청 수 | 요청 1회 최대 호출 |
| `server.supabase_route_test` | 위와 같음 — 시험 기기 UA | 〃 | 〃 | 〃 |
| `server.supabase_target` | `rest.<표>`·`rpc.<함수>`·`auth.<경로>`·`storage`·`realtime` | 호출 수 | 0 | — |

- `value_count`(요청 수)는 **Supabase 를 1번 이상 부른 요청**만 센다(계수기는 fetch 만 본다). 예산 초깃값은 Vercel 「모든 요청」 기준이라 정의가 다르지만,
  2026-11-19 00~12 UTC 실측에서 8개 예산 라우트의 1회당 값이 Vercel 과 10% 안으로 같았다(거의 모든 요청이 Supabase 를 부름). 캐시만으로 끝나는 요청이 많은 라우트를 새로 예산에 넣을 때는 이 차이를 확인한다.
- 계수기는 인스턴스가 멈추면 마지막 전송 전 셈을 잃는다(같은 구간 저장분 ≈ Vercel 의 절반). 호출·요청이 함께 빠지므로 1회당 값 판정에는 영향이 없다.

## 3. 경보 기준

| 경보 | 기준 |
|---|---|
| `route_over_budget` | 예산 라우트의 24시간 1회당 호출 > 예산 × 1.2 (요청 30회 이상인 라우트만) |
| `unbudgeted_route` | 예산 없는 라우트가 24시간 1,000건 이상 |
| `daily_total` | 24시간 합계(시험 기기 제외) > 직전 7일 하루 합계 중앙값 × 1.5 |
| `counter_silent` | 24시간 합계 0건 — 계수기·저장 고장 |

알림: 관리자 알림 `request_budget_alert`(활성 관리자 전원, 푸시 포함), 하루 1건(`request_budget_alert:<PHT 날짜>`).

## 4. 규칙

1. 예산 값은 **내리기만** 한다. 호출을 줄인 PR 이 같은 PR 에서 값을 낮춘다. 올리려면 Owner 승인.
2. 하루 Supabase 1,000건 이상을 부르는 새 API 라우트는 예산 표에 항목을 추가한다(없으면 `unbudgeted_route` 경보).
3. 경보가 오면 원인을 이 집계(라우트·대상 표·시험 기기)로 먼저 나누고 보고한다 — 추측 금지.
4. 계수기 끄기(긴급): Vercel 환경변수 `SUPABASE_CALL_COUNTER=0` (Owner 승인 후 재배포).

## 5. 한계 (알고 쓰는 것)

- 서버리스 인스턴스가 멈추면 마지막 저장 뒤 셈(최대 5분)은 잃는다 → 절대값보다 1회당 호출·전일 대비 배수로 판정한다.
- 미들웨어(`proxy.ts`)·요청 저장소 밖 호출은 `unknown` 으로만 잡힌다(총량 경보에는 포함).
- 앱이 Supabase 를 직접 부르는 호출(Realtime·Storage·브라우저 클라이언트)은 서버 계수기에 잡히지 않는다.
- CI 단계에서 라우트 호출 수를 막는 검사는 없다. 가짜 빈 데이터로는 운영 호출 수를 재현하지 못해(측정: 방 메시지 운영 10.6 → 가짜 3) 넣지 않았다. 감지는 운영 감시가 맡는다.
