# 요청 예산 계수기 — 보내기(POST)·읽기(GET) 나누기 · 설계 (2026-11-22 PHT)

- 지시: Owner 「다음으로 넘어 가자」 → 보내기 설계 문서 §5 「측정 바로잡기」(`message-send-fanout-design-2026-11-21.md`).
- 근거: 코드(main `057ac4a` · 파일 아래) · `node_modules/next` 정의 · Vercel 관측(읽기) · 운영 DB 읽기 전용. 운영 변경 없음.
- 통화 규정: 해당 없음(계수기·예산 표·메시지 보내기 라우트에 표지 1줄 — 통화·푸시 코드 무변경).

## 0. 내 잘못 먼저
- 3단계 설계서의 「3a 후 1:1 보내기 약 37」은 **추정**이었다. 아래 실측(표본 11건)은 1:1 보내기 1번 ≈ **44~49** 로 더 높다. 3a·3b 효과 숫자는 실측 전까지 NOT_PROVEN 으로 고쳐 읽는다. 차이 원인은 아직 모른다(§2 — 지금 계수기로는 나눌 수 없음).

## 1. 지금 결함
| 사실 | 근거 |
|---|---|
| 계수기 키 = 라우트만 → 같은 라우트의 GET(목록 읽기 ≈5)·POST(보내기 ≈45, 받는 사람 수에 비례)가 한 숫자로 섞인다 | `lib/perf/supabase-call-counter.ts` `record()` — `routeToRollupMetric(ctx.route)` |
| 그래서 메시지 예산(6.0)은 그날 보내기 비율에 따라 오경보·놓침이 난다(보내기가 많은 날 넘침, 읽기만 많은 날 보내기 증가를 못 봄) | 11-21 경보 분석 |
| Next 요청 저장소에는 **요청 방식이 없다**(경로·헤더·쿠키만) → 계수기가 스스로 GET/POST 를 알 수 없다 | `next/dist/server/app-render/work-unit-async-storage.external.d.ts` `RequestStore`(type·url·headers·cookies…), `work-async-storage.external.d.ts` `WorkStore.route` |
| 응답 뒤 작업(`after()`)은 같은 요청 저장소에서 돈다 → 응답 뒤 푸시·배지 호출도 그 요청에 묶인다 | `next/dist/server/after/after-context.js` `bindSnapshot`(모든 저장소 보존) · `runCallbacks` 같은 `workStore` |
| 받는 사람 수가 기록되지 않아 「보내기 1번당」「받는 사람 1명당」을 나눌 수 없다 | 같은 파일 · 집계 행에 단위 열 없음 |
| 대상 표별 셈(`server.supabase_target`)은 전역 합계라 「보내기 1번이 어느 표를 몇 번」인지 알 수 없다 | 같은 파일 |

## 2. 실측 (Vercel · 2026-11-21 05:00 ~ 11-22 01:00 UTC · 메시지 라우트)
| 구간 | GET | POST(보내기) | Supabase 호출 | 계산 |
|---|---|---|---|---|
| GET 만 있던 7시간 | 47 | 0 | 218 | GET 1번 ≈ **4.64** |
| 11-21 12시 | 28 | 5 (1:1 · 받는 사람 5) | 375 | (375 − 28×4.64) ÷ 5 ≈ **49** |
| 11-21 13시 | 102 | 6 (받는 사람 9) | 736 | (736 − 102×4.64) ÷ 6 ≈ **44** |
- 보내기 수·받는 사람 수 = 운영 `community_messenger_messages`(text) × 참가 중 인원(보낸 사람 제외).
- 한계: 표본 11건 · GET 단가를 시간대 평균으로 뺀 추정(GET 단가 3.5~5.0 범위 → POST 46~51). **정확한 값은 아래 설계로만 나온다.**

## 3. 설계
| 항목 | 내용 | 바뀌는 파일 |
|---|---|---|
| M-1 요청 표지 | `tagSupabaseCallRequest(label)` — 지금 요청 저장소(계수기가 이미 요청 구분에 쓰는 같은 객체)를 키로 WeakMap 에 표지를 둔다. 표지가 있으면 라우트 키 = `<라우트>::<표지>`(집계 함수 `cm_monitoring_rollup_add` 가 metric `^[a-z0-9_.:-]{1,96}$` 만 받음 — `@`·`|` 는 버려진다, 운영 함수 정의 확인). 표지 전 호출(있다면)은 표지 없는 키에 남는다 → 핸들러 **첫 줄**에서 부른다 | `lib/perf/supabase-call-counter.ts`(+설치 파일에서 저장소 노출) |
| M-2 보내기 표지 | 메시지 라우트 `POST` 첫 줄 `tagSupabaseCallRequest("post")`. GET 은 그대로(표지 없음 = 기존 키) | `app/api/community-messenger/rooms/[roomId]/messages/route.ts` 1줄 |
| M-3 받는 사람 수 | `addSupabaseCallRequestUnits(n)` — 보내기에서 받는 사람 수가 정해지는 곳에서 1번. 새 category `server.supabase_route_units`(event_count = 받는 사람 수 합) | 계수기 + 보내기 경로 1줄 |
| M-4 표지 요청의 표별 셈 | 표지가 붙은 요청만 category `server.supabase_route_target`, metric `<라우트>::<표지>::<rest.표·rpc.함수>`(96자) → 보내기 1번이 어느 표를 몇 번 부르는지 운영 데이터로 나눔(§0 차이 원인 찾기) | 계수기 |
| M-5 예산 판정 | 예산 표 키는 `"/api/…/messages@post"` 로 쓰고 같은 규칙으로 `::post` 로 바꿔 비교(`ROUTE_SUPABASE_CALL_UNIT_BUDGET`). 보내기 예산 = 「보내기 1번당」+「받는 사람 1명당」 두 값: 판정 `호출 > (1번당 × 요청 + 1명당 × 받는 사람) × 1.2` | `request-budget.ts` · `request-budget-watch.ts` · SSOT 문서 §2·§3 |
| M-6 예산 값 | 새 키는 **값 없이** 시작(새로 나뉜 키라 기존 값 올리기가 아님). 7일 실측 뒤 1번당·1명당 값을 정해 넣고, GET 키(지금 6.0)는 실측으로 **내린다**. 값 없는 동안 하루 1,000건 넘으면 기존 `unbudgeted_route` 경보 1건(실제 숫자 보고 — 숨기지 않음) | 다음 PR |
- 다른 GET·POST 혼합 라우트(접속 상태·친구 요청·내 정보 PATCH 등 22개)는 지금 경보와 무관해 표지를 달지 않는다. 필요할 때 같은 1줄로 단다.
- 원래 요청 동작은 바뀌지 않는다: 표지·셈은 try/catch 안 · 원래 fetch 그대로(계수기 기존 원칙).

## 4. 영향·위험
| 항목 | 내용 |
|---|---|
| 영향받는 화면·호출처 | 없음(서버 셈만). 집계 행 수: 표지 1개 × (라우트 1 + 단위 1 + 표 약 30) → 5분 전송 1번에 행 +약 32(전송 상한 128행씩 나눔 — 기존 그대로) |
| 감시 cron | `::post` 키는 지금 예산 표에 없음 → M-6 대로 `unbudgeted_route` 판정만. 기존 GET 키는 보내기가 빠져 1회당 값이 내려간다(경보 줄어듦 — 실제 감소가 아니라 분리 때문임을 SSOT 에 적음) |
| 운영 Supabase 요청 | 늘지 않음(전송은 5분 1번 · 같은 RPC) |
| 롤백 | Instant Rollback · DB 변경 없음 |

## 5. 검증 계획
- 단위 테스트: 표지 있는/없는 요청 키 · `after()` 같은 저장소에서 표지 유지 · 단위·표별 행 · 판정식.
- 반영 뒤 운영 1일: `cm_monitoring_rollup_hourly` 에서 `…messages@post` 호출÷요청, 받는 사람 합, 표별 상위 — Vercel POST 수와 대조. 그 결과로 §0 차이 원인 보고.

## 6. NOT_PROVEN
- 1:1 보내기 44~49 의 정확한 값과 3a 설계 추정(37)과의 차이 원인.
- 3a·3b 의 운영 감소량.
- 오늘 경보의 다른 7건(사장님 허브 배지·내 정보·알림음·동네 주제·알림 설정·접속 상태·그룹 미디어) — 이 설계 범위 밖.

## 7. 구현 (2026-11-22 · Owner 「구현 승인」)
- `lib/perf/supabase-call-counter.ts`: `tagSupabaseCallRequest`·`addSupabaseCallRequestUnits`(설치된 계수기 + 요청 저장소) · 표지 키·단위 행·표별 행 · 시험 기기는 단위·표별 저장 안 함 · 이미 셈이 있는 요청은 표지 안 함.
- 메시지 라우트 POST 첫 줄 표지 · 전송 성공 시 받는 사람 수(전송 RPC 가 돌려준 경우만 — 기존 함수 폴백 경로는 단위 없음).
- `request-budget.ts` `ROUTE_SUPABASE_CALL_UNIT_BUDGET`(비어 있음) · 감시 판정·집계에 단위 · SSOT 문서 §2·§3.
- 배포 전 보고 — 자동 병합 등록 안 함(메신저 라우트 포함).
