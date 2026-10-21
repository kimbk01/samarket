# J. 5단계 L1 시나리오 매트릭스 — S01~S05

- 기준: `G-2-stage3-5-design.md` §5-0~5-5 (S01~S05, §5-4 게이트 「단계 종료 = L1 전부」).
- 범위: **L1 만** (vitest 라우트·lib 단위, Supabase mock + RTL). DB·브라우저·실계정 셀은 표시만 하고 증명하지 않는다.
- 결과 표기: `PASS` = 로컬 vitest 통과(L1) · `NOT_PROVEN` = L1 로 증명 불가(필요 층 표기). Preview/Production/실기기 PASS 아님.
- 새 테스트: `lib/stage5/__tests__/s01…s05-*.test.ts` (공용 상태형 mock `lib/stage5/__tests__/helpers/stage5-order-world.ts` — 주문 DB 함수는 **계약 응답만** 흉내 내며 SQL 트랜잭션·트리거는 증명하지 않는다).
- 파일 약어: `S1`=`lib/stage5/__tests__/s01-product-to-buyer-menu.test.ts`, `S2`=`…/s02-order-lifecycle-fee.test.ts`, `S3`=`…/s03-buyer-cancel.test.ts`, `S4`=`…/s04-owner-direct-cancel.test.ts`, `S5`=`…/s05-admin-intervention.test.ts`.
  기존: `P3E`=`app/api/me/stores/[storeId]/products/__tests__/owner-product-3e.route.test.ts`, `P1J`=`app/api/me/stores/[storeId]/products/[productId]/__tests__/owner-product-patch-1j.route.test.ts`, `AP1J`=`app/api/admin/store-products/[productId]/__tests__/admin-store-product-1j.route.test.ts`, `PD1J`=`app/api/stores/products/[productId]/__tests__/public-product-detail-1j.route.test.ts`, `MS1J`=`app/api/me/stores/[storeId]/menu-sections/__tests__/menu-sections-1j.route.test.ts`, `G1`=`lib/stores/__tests__/apply-store-order-status-g1-stage1.test.ts`, `EC`=`lib/stores/__tests__/apply-store-order-status-expected-current.test.ts`, `OD`=`lib/stores/__tests__/owner-store-order-decision.test.ts`, `AI`=`lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts`, `R4B`=`lib/admin/store-orders/__tests__/admin-store-order-r4b-orders.test.ts`, `CS`=`lib/stores/commission/__tests__/store-commission-ssot.test.ts`, `CA`=`lib/stores/__tests__/create-store-order-atomic.test.ts`, `L4`=`lib/stores/__tests__/loc004-order-serviceability-snapshot.test.ts`, `OL`=`lib/stores/__tests__/owner-lifecycle-and-write-gate.test.ts`, `MOL`=`lib/business/__tests__/merge-owner-store-order-list-rows.test.ts`, `FB`=`components/business/owner/__tests__/owner-stage4-screen-feedback.test.tsx`, `DN`=`lib/stores/__tests__/store-order-g1-stage1-delivery-notify.test.ts`.

## S01 상품 등록·수정 → 주문자 메뉴

| 시나리오 | 케이스 | 홉 | L1 테스트 (path::name) 또는 필요 층 | 결과 |
|---|---|---|---|---|
| S01 | 등록 | 주문자 행동(메뉴 열람·장바구니) | L3 필요 (브라우저) | NOT_PROVEN |
| S01 | 등록 | 오너 화면(허브 서버 값·실패 B 띠) | L3 필요 (허브 RTL 없음) | NOT_PROVEN |
| S01 | 등록 | 서버·DB — POST 1행·멱등·상한·500 원문 미노출 | S1::POST creates exactly one row, bumps the shared generation; …; P3E::same client_request_id twice → one row…; P3E::rejects over-limit…; P3E::500 never echoes the DB message | PASS |
| S01 | 등록 | 서버·DB — 공용 캐시 세대 +1(OPS-02) | S1::POST creates exactly one row, bumps the shared generation…; MS1J::OPS-02 owner write routes bump… | PASS |
| S01 | 등록 | 서버·DB — 직접 REST 쓰기 42501(P0-2) | L2 필요 (RLS) | NOT_PROVEN |
| S01 | 등록 | 관리자 화면 — 목록 같은 가격·상태 · 권한 없으면 403 | S1::POST creates exactly one row… (admin list) · S1::admin list without the admin permission → 403 | PASS |
| S01 | 등록 | 주문자 결과 — 상세 같은 가격·상태 | S1::POST creates exactly one row… (buyer detail) | PASS |
| S01 | 등록 | 주문자 결과 — 메뉴판 스냅샷 2초 반영 | L2(스냅샷 RPC)+L3 필요 | NOT_PROVEN |
| S01 | 가격·옵션 수정 | 오너 화면 | L3 필요 | NOT_PROVEN |
| S01 | 가격·옵션 수정 | 서버·DB — PATCH 가격·옵션 저장·세대 +1·낙관적 잠금·할인 재계산 | S1::PATCH price + option group → …; P1J::matching expected_updated_at → 200 … OPS-02 bump; P1J::stale expected_updated_at → 409 product_changed…; P1J::price-only change recomputes discount…; P3E::duplicate option name → 400 | PASS |
| S01 | 가격·옵션 수정 | 관리자 화면 — 같은 가격 | S1::PATCH price + option group → … (admin list); AP1J::PRD-04 correct_price recomputes discount… | PASS |
| S01 | 가격·옵션 수정 | 주문자 결과 — 상세 새 가격·옵션 | S1::PATCH price + option group → … (buyer detail) | PASS |
| S01 | 가격·옵션 수정 | 주문자 결과 — 체크아웃 RPC 같은 가격(`price_changed` 없음)·주문 라인 스냅샷 | L2 필요 (`create_store_order_atomic`) | NOT_PROVEN |
| S01 | 품절·숨김 | 오너 화면 | L3 필요 | NOT_PROVEN |
| S01 | 품절·숨김 | 서버·DB — sold_out(manual)·hidden 저장·세대 +1·관리자 잠금 해제 불가 | S1::owner sold_out → …(manual reason)…; S1::owner hidden → buyer detail 404…; P1J::owner sold_out writes reason manual…; P1J::owner cannot reverse admin hide / sold_out (403 admin_locked…) | PASS |
| S01 | 품절·숨김 | 관리자 화면 — 같은 상태, 검수 반려 상품 오너 active 불가(PRD-03) | S1::owner sold_out → … admin list same status; S1::owner hidden → … admin list shows hidden; P1J::rejected product edit moves to pending; selling stays blocked…; AP1J::ND-1 sold_out sets lock… | PASS |
| S01 | 품절·숨김 | 주문자 결과 — 품절 노출·숨김 404·검수 대기 404 | S1::owner sold_out → buyer still sees…; S1::owner hidden → buyer detail 404…; PD1J::re-review pending / rejected → 404; PD1J::hidden section → 404 | PASS |

## S02 주문 생성 → 접수 → 조리(수수료) → 배달 → 완료

| 시나리오 | 케이스 | 홉 | L1 테스트 (path::name) 또는 필요 층 | 결과 |
|---|---|---|---|---|
| S02 | 공통 | 주문자 행동 — 체크아웃·주문 생성 RPC 매핑·배달 판정 스냅샷 | CA::maps RPC success / maps business error with http_status / maps missing RPC to 503; L4 (LOC-004 스냅샷 6건) | PASS |
| S02 | 공통 | 주문자 행동 — RPC 내부(LOC-004 NOT NULL·재고·쿠폰 TX) | L2 필요 | NOT_PROVEN |
| S02 | 공통 | 오너 화면 — 신규 탭 즉시(Realtime+푸시) | L3/L5 필요 | NOT_PROVEN |
| S02 | 공통 | 오너 화면 — 60건 넘어도 노출(ORD-05) | MOL::owner orders history paging (ORD-05); OL::owner orders history cursor (ORD-05) | PASS |
| S02 | 공통 | 오너 화면 — 전이 실패 시 오류 띠·재조회 | FB::IA-23 409 transition_conflict → message in dialog error band…; FB::mapped code (order_admin_locked)… | PASS |
| S02 | 기준 이후 정상 완료 | 서버·DB — 전이 그래프·CAS·단계별 알림 1회·수락 ETA·완료 시 Coin 인식 | S2::owner walks pending → completed: every step 200, CAS on the previous status, one buyer notice per step, Coin recognised once; S2::the same step sent twice … → idempotent 200, one write, one notice; G1::OWNER accept → notice carries the prep ETA minutes (NTF-03) | PASS |
| S02 | 기준 이후 정상 완료 | 서버·DB — TS 가 수수료 금액·Cash 원장을 쓰지 않음 | S2::TS writes no fee obligation / Cash ledger / settlement row…; CS::TS never charges or reverses commission money; OD::decision service writes no commission or cash rows | PASS |
| S02 | 기준 이후 정상 완료 | 서버·DB — 트리거 거부 시 상태 롤백 매핑(409) | S2::commission trigger refuses the preparing UPDATE → 409 …; G1::commission charge refused inside the RPC → existing 409 mapping | PASS |
| S02 | 기준 이후 정상 완료 | 서버·DB — 조리 진입 TX 의무 1행(7%)·SALE_FEE 원장/미납 | L2 필요 (트리거 `trg_store_orders_commission_lifecycle`) | NOT_PROVEN |
| S02 | 기준 이후 정상 완료 | 관리자 화면 — 주문 상세 같은 상태·ETA | S2::owner walks pending → completed… (`loadAdminStoreOrderDetail`) | PASS |
| S02 | 기준 이후 정상 완료 | 관리자 화면 — `/admin/store-settlements` 의무 1행 = 오너 `/settlements` 같은 SQL | CS::Admin and Owner routes call the same SQL readers (정적) · 행 값은 L2 | PASS(정적)·값 NOT_PROVEN(L2) |
| S02 | 기준 이후 정상 완료 | 주문자 결과 — 단계별 알림·수락 ETA | S2::owner walks pending → completed…(6회·ETA 20) | PASS |
| S02 | 기준 이후 정상 완료 | 주문자 결과 — 완료 후 리뷰 가능 | L3 필요 | NOT_PROVEN |
| S02 | 자동 구매확정(ORD-02) | 서버·DB — 크론 due 1회 완료·재실행 0·미도래 건너뜀 | S2::cron completes a due arrived order once…; S2::not yet due → cron skips it…; G1::SYSTEM auto_complete → auto-complete notice | PASS |
| S02 | 자동 구매확정(ORD-02) | 주문자 결과 — 자동확정 문구(매장 완료 아님) 1회 | S2::cron completes a due arrived order once… | PASS |
| S02 | 자동 구매확정(ORD-02) | 관리자 화면 | L3 필요 | NOT_PROVEN |
| S02 | 기준 이전 생성 주문 | 서버·DB — TS 경로·payload 기준 이후와 동일, 수수료 쓰기 0 | S2::same TS path and payload shape as a post-cutoff order… | PASS |
| S02 | 기준 이전 생성 주문 | 서버·DB — 기준 시각 상수(트리거 `c_charge_from` = 자동화 기준) | S2::fee cutoff is the DB trigger's constant (2026-10-20 20:30 UTC)… (정적) | PASS(정적) |
| S02 | 기준 이전 생성 주문 | 서버·DB — 의무 0행(실제 트리거 동작) | L2 필요 | NOT_PROVEN |
| S02 | 기준 이전 생성 주문 | 서버·DB — 자동확정 크론 미대상(D-5) | S2::auto-complete cron does not pick up a pre-cutoff arrived order… | PASS |
| S02 | 전 케이스 | 원장 화면 합계 오너=관리자 | L2/L4 필요 | NOT_PROVEN |

## S03 구매자 취소

| 시나리오 | 케이스 | 홉 | L1 테스트 (path::name) 또는 필요 층 | 결과 |
|---|---|---|---|---|
| S03 | 접수 전 즉시 취소 | 주문자 행동 — 취소 버튼 → PATCH `cancel` | S3::buyer cancels a pending order… | PASS |
| S03 | 접수 전 즉시 취소 | 오너 화면 — 신규 탭에서 사라짐 | L3 필요 | NOT_PROVEN |
| S03 | 접수 전 즉시 취소 | 서버·DB — CAS `pending→cancelled`(한쪽만)·재고 복원 호출·수수료 쓰기 0 | S3::buyer cancels a pending order…; S3::owner accepted first → buyer direct cancel refused…; S3::accept lands between the read and the cancel DB function (CAS lost) → 409…; G1::CUSTOMER cancel from pending → store_order_cancel_direct_atomic… | PASS |
| S03 | 접수 전 즉시 취소 | 서버·DB — 2세션 실제 경합·재고 복원 SQL | L2 필요 | NOT_PROVEN |
| S03 | 접수 전 즉시 취소 | 관리자 화면 | L3 필요 (상태는 S3 world 로 동일 — 화면 미검증) | NOT_PROVEN |
| S03 | 접수 전 즉시 취소 | 주문자 결과 — 오너 알림 1·구매자 자기 알림 없음 | S3::buyer cancels a pending order… | PASS |
| S03 | 접수 전 즉시 취소 | 주문자 결과 — 쿠폰·상품권 복원 | L2 필요 (S06, `store_order_apply_cancel_side_effects`) | NOT_PROVEN |
| S03 | 요청 → 오너 승인 | 주문자 행동 — 사유 필수 요청 | S3::request without a reason → 400…; EC::no reason → 400, no RPC | PASS |
| S03 | 요청 → 오너 승인 | 오너 화면 — 취소·환불 탭 표시 | L3 필요 | NOT_PROVEN |
| S03 | 요청 → 오너 승인 | 서버·DB — 요청 RPC(CAS)·`/decide` `expected_status` CAS·stale 409·PATCH 우회 불가 | S3::buyer request → owner approve with expected_status → cancelled…; S3::owner decided on a stale screen… → 409 status_changed; S3::owner PATCH cannot decide a request; OD::status changed since the owner looked → 409 | PASS |
| S03 | 요청 → 오너 승인 | 서버·DB — 원장+상태 1 TX·조리 후 승인 시 검토 플래그 | L2 필요 | NOT_PROVEN |
| S03 | 요청 → 오너 승인 | 관리자 화면 — 같은 상태·요청자·사유 | S3::buyer request → owner approve… (`loadAdminStoreOrderDetail`) | PASS |
| S03 | 요청 → 오너 승인 | 주문자 결과 — 취소 완료 알림 1·오너 요청 알림 1·pending 0 | S3::buyer request → owner approve… | PASS |
| S03 | 요청 → 오너 반려 | 오너 화면 — 사유 필수 | S3::reject without a reason → 400 reason_required…; OD::reject without a reason → 400 | PASS |
| S03 | 요청 → 오너 반려 | 서버·DB — 기록된 이전 상태 복원·같은 사유가 원장·이벤트·감사에·이중 탭 409 | S3::reject restores the recorded status; the same reason string reaches ledger, status event, audit and the buyer notice; S3::a second decision on the same request (double tap) → 409… | PASS |
| S03 | 요청 → 오너 반려 | 관리자 화면 — 같은 상태·반려 사유 | S3::reject restores the recorded status… (`loadAdminStoreOrderDetail`) | PASS |
| S03 | 요청 → 오너 반려 | 주문자 결과 — 반려 사유 원문 알림 1 | S3::reject restores the recorded status… (`notifyBuyerStoreRefundRejected.reason`) | PASS |
| S03 | 전 케이스 | 경합 2세션(L2)·화면(L3)·실측(L5) | L2/L3/L5 필요 | NOT_PROVEN |

## S04 오너 직접 취소

| 시나리오 | 케이스 | 홉 | L1 테스트 (path::name) 또는 필요 층 | 결과 |
|---|---|---|---|---|
| S04 | 접수 후 재료 소진 | 주문자 행동(대기) | 해당 없음 | — |
| S04 | 접수 후 재료 소진 | 오너 화면 — 사유 선택·확인창(busy) | L3 필요 | NOT_PROVEN |
| S04 | 접수 후 재료 소진 | 서버·DB — 사유 필수·관리자 잠금 409·원자 RPC(CAS)·TS 원장 직접 쓰기 0·재고 복원 호출 | S4::no reason → 400 cancel_reason_required…; S4::admin-locked order → 409…; S4::reason reaches ledger(admin) · event · buyer notice as the same string; stock restored once; G1::calls the RPC with the decided status and writes no TS ledger / order row | PASS |
| S04 | 접수 후 재료 소진 | 서버·DB — 원장·상태 같은 TX·수동 품절 유지(PRD-06) | L2 필요 | NOT_PROVEN |
| S04 | 접수 후 재료 소진 | 관리자 화면 — 사유·주체(매장) | S4::reason reaches ledger(admin)… (`requester: owner`) | PASS |
| S04 | 접수 후 재료 소진 | 주문자 결과 — 「매장 취소 — 사유」 알림(ORD-09) | S4::reason reaches ledger(admin)…; G1::notice carries the reason (verbatim, trimmed ≤500); DN::owner cancel with reason → reason in body + meta | PASS |
| S04 | 접수 후 재료 소진 | 주문자 결과 — 쿠폰·상품권 복원 | L2 필요 | NOT_PROVEN |
| S04 | 조리 후 | 오너 화면 | L3 필요 | NOT_PROVEN |
| S04 | 조리 후 | 서버·DB — 같은 사유 계약·CAS 실패 409(부수효과 0)·픽업 후 거부·PATCH 우회 거부·TS 수수료 쓰기 0 | S4::same reason contract after cooking…; S4::status moved between the owner's read and the atomic call (CAS lost) → 409…; S4::courier already picked up → 400…; S4::the plain status PATCH cannot cancel after cooking… | PASS |
| S04 | 조리 후 | 서버·DB — 의무 행 유지 + 검토 플래그(트리거) | L2 필요 | NOT_PROVEN |
| S04 | 조리 후 | 관리자 화면 — 사유·주체 | S4::same reason contract after cooking… | PASS |
| S04 | 조리 후 | 관리자 화면 — 검토 큐 노출 | L2 필요 (플래그 행) | NOT_PROVEN |
| S04 | 조리 후 | 주문자 결과 — 사유 알림 | S4::same reason contract after cooking… | PASS |

## S05 관리자 개입

| 시나리오 | 케이스 | 홉 | L1 테스트 (path::name) 또는 필요 층 | 결과 |
|---|---|---|---|---|
| S05 | 오너 반려 직후 관리자 강제 취소 | 주문자 행동 — 반려 통지 수신 | S5::admin decided on the pre-reject screen… (`notifyBuyerStoreRefundRejected` 1회) | PASS |
| S05 | 오너 반려 직후 관리자 강제 취소 | 오너 화면 — 「관리자 처리」 배지·사유 | L3 필요 | NOT_PROVEN |
| S05 | 오너 반려 직후 관리자 강제 취소 | 오너 화면 — `admin_locked` 시 오너 결정 409 | OD::admin-locked order → 409, no write; FB::mapped code (order_admin_locked)… | PASS |
| S05 | 오너 반려 직후 관리자 강제 취소 | 서버·DB — 확인 시점 상태 = CAS 값, 바뀌면 409 `status_changed`+최신 상태·쓰기 0 | S5::admin decided on the pre-reject screen → 409 status_changed + latest status…; S5::order changed after the server check (write CAS lost) → 409…; AI::%s passes expectedStatus=%s to %s; AI::%s: order changed after the check (write CAS lost) → 409 | PASS |
| S05 | 오너 반려 직후 관리자 강제 취소 | 서버·DB — 재확인 후 재실행: 감사 1행(사유)·재전송 부수효과 0 | S5::admin re-checks and force-cancels on the latest status… resend → 409, no repeat | PASS |
| S05 | 오너 반려 직후 관리자 강제 취소 | 관리자 화면 — 409 시 「상태가 바뀌었습니다」 문구 | 라우트 `current_status` 응답은 S5 PASS · 문구 표시는 L3 필요 | NOT_PROVEN |
| S05 | 오너 반려 직후 관리자 강제 취소 | 주문자 결과 — 최종 1회 알림(관리자 주체)·관리자 사유 비노출 | S5::admin re-checks and force-cancels…; AI::admin reasons stay out of buyer-visible order events | PASS |
| S05 | 권한 없는 스태프 | 서버·DB/관리자 화면 — 권한키 없으면 403·주문 읽기·쓰기 0 | S5::staff without the business permission key → 403 forbidden_permission… | PASS |
| S05 | 권한 없는 스태프 | 관리자 화면 — 버튼 비노출 | L3 필요 | NOT_PROVEN |
| S05 | 정상 개입 | 서버·DB — 사유 필수·`expected_status` 필수 | S5::reason missing → 400…; AI::no reason → 400, nothing written | PASS |
| S05 | 정상 개입 | 서버·DB — 결정 RPC(관리자·CAS)·원장 종료·감사 1 | S5::admin approves the pending buyer request…; AI::approve cancel request → existing op + audit with reason and actor | PASS |
| S05 | 정상 개입 | 오너 화면 — 관리자 처리 알림 1(DEF-67) | S5::admin approves the pending buyer request… (`appendUserNotification` 1) | PASS |
| S05 | 정상 개입 | 주문자 결과 — 최종 알림 1 | S5::admin approves the pending buyer request… | PASS |
| S05 | 정상 개입 | 금전 — 조리 후면 검토 플래그 1회 | L2 필요 | NOT_PROVEN |

## 집계

| 구분 | 셀 수 |
|---|---|
| 전체 셀 (시나리오·케이스·홉 행) | 83 |
| L1 PASS (정적 계약 PASS 2 포함) | 51 |
| NOT_PROVEN | 31 |
| 해당 없음 | 1 |
| 필요 층별(중복 포함): L2 필요 | 17 (PASS(정적) 행의 값 확인 1 포함) |
| 필요 층별(중복 포함): L3 필요 | 17 |
| 필요 층별(중복 포함): L5 필요 | 2 |

- 실행: `npx vitest run lib/stage5` 37/37 PASS · 매트릭스가 인용한 기존 20개 파일 290/290 PASS (로컬, 2026-10-21).
- L2 셀은 ND-3(격리 DB) 지시 전까지 NOT_PROVEN — 운영 적용 후 L4 불변식(I-1·I-2·I-5)으로만 확인 가능.

## 발견 사항 (수정하지 않음 — 범위 밖, 보고만)

1. **오너 PATCH 로 `accepted → cancelled` 가 사유·원장 없이 가능** — `app/api/me/stores/[storeId]/orders/[orderId]/route.ts:382` 는 `OWNER_CANCEL_REQUEST_FROM`(preparing~arrived)만 `owner_cancel_route_required` 로 막는다. `accepted` 는 `allowedOrderTransitions` 에 `cancelled` 가 있어 `store_order_cancel_direct_atomic(p_actor OWNER)` 로 취소되며 취소 원장 행·사유가 남지 않고 구매자 알림에 사유가 없다(ORD-06·ORD-09 계약과 다름). 현재 오너 주문 카드(`OwnerStoreOrderMockCard`)는 사유 경로(`/cancel-request`)를 쓰므로 UI 노출은 없음(`OwnerStoreOrderPeekCancelBar` 는 미사용).
2. **접수 전(`pending`) 거절 시 선택한 사유가 버려짐** — `components/business/owner/OwnerStoreOrderDeliveryActions.tsx:157` `confirmReject(_reasonLabel)` 가 사유를 보내지 않고 `PATCH cancelled` 만 호출. 메신저 오너 액션바(`StoreOrderOwnerMessengerActionBar`)·채팅 판매자 패널(`StoreOrderSellerOrderPanel`)에서 사용. S03/S04 케이스 밖(접수 전 오너 거절)이라 보고만 한다.
