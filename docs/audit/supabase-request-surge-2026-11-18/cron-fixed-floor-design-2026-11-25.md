# 고정 바닥 줄이기 — 1분 cron·통화 정리 · 설계 (2026-11-25 PHT)

- 지시: Owner 「설계서 작성」(앞 보고 `rise-root-cause-2026-11-25.md` §7 순서 1 「고정 바닥(1분 cron 4개·통화 정리) 설계서부터」).
- 근거: Supabase edge_logs(11-23 02~06 PHT 4시간·사용자 0) · Vercel 관측(11-23 cron 경로별) · 운영 DB 읽기 전용 · 코드(main `7ea024a`) · `vercel.json`. 운영 변경 없음. **구현 안 함.**

## 1. 실측 — 사용자 0명이어도 나가는 호출 (11-23 하루)
| 작업 | 주기 | 1번당 | 하루 | 실제로 할 일 |
|---|---|---|---|---|
| `notification-push-handoff`(채팅 푸시 복구) | 1분 | 1 (claim RPC) | 1,507 | 7일간 채팅 푸시 264건 **전부 즉시 경로로 나감, cron 복구 0건** |
| `store-orders-accept-timeout`(미접수 자동 취소) | 1분 | 1 (`store_orders` 읽기) | 1,491 | **14일간 주문 0건** (마지막 주문 11-04) |
| `store-order-accept-reminders`(접수 독촉) | 1분 | 1 (`store_orders` 읽기) | 1,483 | 같음 |
| `commerce-notification-push-handoff`(커머스 푸시 복구) | 2분 | 2 (주문 이벤트 읽기 + claim) | 1,451 | 최근 180분 주문 이벤트 0건 |
| `calls/sessions/stale-cleanup`(통화 정리) | 2분 | 3 (진행 통화 읽기 + 울림 통화 읽기 + 관리자 통화 설정 읽기) | 2,190 | 지금 울림·진행 통화 0건 |
| **합계** | | | **8,122** | 조용한 날 전체(30.9k)의 26% |
- edge_logs 4시간(240분) 실측: `store_orders` GET 533 · `claim_notification_push_handoff` 240 · `claim_commerce…` 120 · `store_order_events` 122 · `community_messenger_call_sessions` GET 240 · `admin_messenger_call_sound_settings` 120 — 위 1번당 값과 맞음.
- 구조: 1번 돌 때 쓰는 호출은 이미 1~3번으로 작다. **비용은 주기(1~2분)에서 나온다** — 할 일이 없어도 「있는지」 확인하러 매번 Supabase 를 부른다.

## 2. 계약·규정 (먼저 읽음)
| 대상 | 계약 | 이 설계에 주는 제약 |
|---|---|---|
| 커머스 푸시 복구 cron | `docs/dibay-order-commerce-notification-durability-hard-lock.md` 「Retry owner: `/api/cron/commerce-notification-push-handoff` (vercel `*/2`)」 · 「Change gate: Commerce notify / handoff columns / this cron → regression-only. Reopen only on Owner PRODUCT FAIL + first divergence.」 | **HARD LOCK** — 바꾸려면 Owner reopen 승인 필요 → 2단계로 분리 |
| 통화 정리 | 통화 변경 규정(AGENTS.md) · `docs/dibay-call-authority-lock.md`·`docs/community-messenger-active-call-lifecycle.md` 가 stale-cleanup 을 통화 종료 권한으로 명시 | **통화 규정** — 통화 영향 분석서 → Owner 승인 → 통화만 단독 PR → 실기 행렬 → 3단계로 분리 |
| 채팅 푸시 복구 | ~~이름으로 잠근 문서 없음~~ **정정(11-26)**: 이 cron 은 `missed_call`·`incoming_call_signal` 푸시도 복구한다(`lib/notifications/chat-notification-push-handoff.ts` `CHAT_CALL_TYPES`) · `lib/security/side-effect-gate.ts`·`side-effect-gate.test.ts` 가 「통화 규정 — 통화 단독 계획·승인 전 변경 금지」로 제외 | **통화 규정** → 3단계(통화 정리)와 같은 절차. 1단계에서 뺀다 |
| 주문 자동 취소·독촉 | `lib/stores/store-order-lifecycle-automation.ts`(접수 제한 10분·자동화 기준 시각) · 상태 쓰기는 `applyStoreOrderStatusTransition` 만 | 판정·쓰기 경로 그대로, 「돌릴지」만 바꿈 |
| 요청 예산 | `docs/request-budget-ssot.md` — 줄인 변경은 같은 PR 에서 예산 값을 낮춘다 | `lib/perf/request-budget.ts` 의 cron 항목 정리 |

## 3. 방향 (결정)
**1분마다 하나의 cron(`/api/cron/minute-tick`) + DB 함수 1번(`cron_minute_tick`)이 「할 일이 있는지」를 한 번에 판정하고, 할 일이 있는 작업만 지금 코드 그대로 돌린다.**
- DB 안 예약(pg_cron·pg_net)은 쓰지 않는다 — 운영에 두 확장이 없다(11-25 조회: `supabase_vault` 만). 새 확장 설치·DB 에 비밀 저장·DB→Vercel 호출이라는 새 실패 경로가 생긴다.
- 채팅 푸시 claim 은 그 자체가 「할 일 확인」이라 DB 함수 안에서 **기존 claim 함수를 그대로 호출**한다(조건 복사 없음).

## 4. 단계
### 1단계 정정 (2026-11-26 구현 시) — 주문 2개만, DB 함수 없음
- **설계 오류(작업자)**: 채팅 푸시 복구 cron 을 「일반」으로 분류했으나 통화 푸시(부재중·수신 신호)를 싣는 통화 규정 대상이다(§2 정정). 구현에서 뺐다 — 그 cron 은 `vercel.json` 1분 그대로, 코드 무변경.
- 채팅 claim 이 빠지면 DB 함수가 필요 없다: 새 `/api/cron/store-orders-minute-tick` 이 `store_orders` 를 두 작업 조건의 상위 집합(pending·paid·자동화 기준~지금)으로 **1행만** 읽어, 없으면 끝(Supabase 1번), 있으면 지금 두 작업 본문(`lib/stores/cron/*-job.ts` 로 옮김, 동작 무변경)을 자동 취소 → 독촉 순서로 실행. 확인 실패 시 두 작업 그대로 실행. 작업별 try/catch. 부작용 게이트·인증 그대로.
- **운영 DB 적용 없음**(마이그레이션 없음). 하루(할 일 없을 때) 주문 2개 2,974 → **1,440**(−1,534). 채팅 푸시 복구 1,507 은 그대로.
- 아래 원래 1단계 표는 기록으로 남긴다(채팅 부분은 통화 절차 뒤에만).

### 1단계 (원안 — 채팅 부분 보류) — 채팅 푸시 복구 + 주문 자동 취소 + 접수 독촉
| 항목 | 내용 |
|---|---|
| DB 함수 | `cron_minute_tick(p_chat_types text[], p_chat_limit int, p_claim_token text, p_orders_from timestamptz) returns jsonb` = `{ chat_claimed: [claim_notification_push_handoff(p_chat_types, p_chat_limit, p_claim_token, 120) 결과 행], orders_pending: exists(store_orders where order_status='pending' and payment_status='paid' and created_at >= p_orders_from and created_at <= now()) }` · `security definer` · 실행 권한 service_role 만 |
| 라우트 | 새 `app/api/cron/minute-tick/route.ts` — 인증(`CRON_SECRET`) → DB 함수 1번 → `chat_claimed` 는 지금 `processClaimedChatPushHandoff` 로 처리 → `orders_pending` 이면 지금 자동 취소·독촉 본문을 차례로 실행(부작용 게이트 `rejectCronIfSideEffectsBlocked` 는 지금처럼 주문 작업에만) |
| 코드 이동 | 세 라우트 본문을 `lib/` 함수로 옮기고 기존 라우트·새 라우트가 같은 함수를 부른다(동작 무변경, 수동 실행 경로 유지) |
| 예약 | `vercel.json` 의 1분 3개 → `* * * * * /api/cron/minute-tick` 1개 |
| DB 함수 없음(적용 전) | 지금처럼 claim RPC + 주문 읽기로 폴백 — 배포·DB 적용 순서와 무관하게 안전 |
| 하루 호출(할 일 없을 때) | 4,481 → **1,440** (−3,041) |
| 할 일 있을 때 | 주문 대기 중: 1 + 주문 읽기 2 = 지금과 같음(채팅 claim 이 합쳐져 −1) |
| 영향 화면·경로 | 채팅 푸시 복구(즉시 경로 실패 시) · 결제 완료 주문 10분 미접수 자동 취소 · 사장님 30초/60초 접수 독촉 푸시. 즉시 채팅 푸시·주문 화면·결제는 무관 |
| 바뀌는 시각 | 없음(1분 주기 그대로). 세 작업이 같은 실행 안에서 차례로 돈다 — 실행 시간 = 셋의 합(지금 각 1회 수십 ms, 주문 0건) |
| 위험 | ① 한 작업이 예외를 던지면 뒤 작업이 막힘 → 작업별 try/catch 로 격리 ② 실행 시간 초과 → 주문 대량일 때만, 지금 제한(200·300건) 그대로 ③ DB 함수 권한 → service_role 만 |
| 예산 | `request-budget.ts` 의 세 cron 항목을 `minute-tick: 1.0` 으로 교체 |
| 시험 | 할 일 없음 → DB 1번·주문 읽기 0 · 채팅 claim 결과 처리 · 주문 대기 시 두 작업 실행 · 작업 예외 격리 · DB 함수 없음 폴백 · 기존 라우트 수동 실행 동작 같음 |
| 운영 DB 적용 | 새 함수 1개(마이그레이션) — **Owner 승인 후 적용** |
| 롤백 | `vercel.json` 예약을 되돌리는 커밋(기존 라우트 그대로 있음) · 급하면 Instant Rollback · DB 함수는 남아도 무해 |

### 2단계 (HARD LOCK reopen 필요) — 커머스 푸시 복구
- 같은 DB 함수에 `commerce_claimed`(기존 `claim_commerce_notification_push_handoff` 호출)와 `commerce_reconcile_due`(최근 180분 주문 이벤트 있음)를 더한다. reconcile 은 이벤트가 있을 때만. 주기는 1분(지금 2분보다 빠름, 추가 호출 없음).
- 하루 −1,451 (할 일 없을 때).
- **충돌**: HARD LOCK 문서는 「이 cron 은 회귀 수정만, PRODUCT FAIL 일 때만 reopen」. 이번은 비용 이유라 문서 조건에 맞지 않는다 → **Owner reopen 결정 필요**. 결정 전에는 손대지 않는다.

### 3단계 (통화 규정) — 통화 정리
- 같은 DB 함수에 `live_calls`(`community_messenger_call_sessions` 에 `status in ('active','ringing')` 행 있음)를 더한다. 두 정리 함수가 읽는 행이 정확히 이 두 상태뿐이라(코드 확인: `.eq("status","active")`·`.eq("status","ringing")`) 「없으면 정리할 것도 없음」이 성립한다. 있으면 지금처럼 2분마다(짝수 분) 정리.
- 하루 −2,190 (통화 없을 때). 관리자 통화 설정 읽기(120/4h)도 통화가 있을 때만.
- **통화 규정 대상**: 통화 영향 분석서(울림 시간 초과→부재중·진행 통화 끊김 판정·CallKit 종료·구 바이너리) → Owner 승인 → 통화만 단독 PR → 실기 행렬(무응답 타임아웃·통화 중 끊김 포함). 1단계와 묶지 않는다.

## 5. 합계 (할 일 없을 때)
| | 지금 | 1단계 | +2단계 | +3단계 |
|---|---|---|---|---|
| 5개 작업 하루 (원안) | 8,122 | 5,081 | 3,630 | **1,440** |
| 조용한 날 전체(11-23 30.9k 기준, 원안) | 30.9k | 27.9k | 26.4k | 24.2k |
| **정정 후 1단계(주문 2개만)** | 8,122 | **6,588** (−1,534) | — | 채팅 푸시 복구는 통화 절차 뒤 |

## 6. 범위 밖 (보고만)
| 대상 | 하루 | 구조 |
|---|---|---|
| 5·10분 주기 DB tick 10여 개(SLA·광고·캠페인·관리자 알림·가져오기·노출 전환 등) | 약 3,000 | 할 일 없어도 주기 실행 |
| `store-product-images-orphan-gc`(하루 1번) | 826 | 매장마다 표 7개 + 저장소 목록을 따로 읽음(N+1) |
| `crew-rep-daily-recompute`(하루 1번) | 407 | 사람마다 읽기·쓰기 |

## 7. NOT_PROVEN
- 감소량은 11-23 실측 기반 추정 — 반영 뒤 같은 방식(edge_logs 야간 4시간·Vercel cron 경로별)으로 재측정.
- 주문이 실제로 들어오는 날의 tick 실행 시간(지금 주문 0건이라 측정 불가).
