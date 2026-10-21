# 문서 J — 5단계 L1 시나리오 매트릭스 (S06~S10)

- 기준: 문서 G-2 「5단계」 §5-0~5-5 (S06~S10, §5-4 게이트). 기준 커밋 `dad8fa16` 이후 작업 트리.
- 층 정의(§5-1): **L1** vitest(라우트·lib, Supabase mock)+RTL · **L2** 격리 DB(ND-3) · **L3** Playwright · **L4** 운영 읽기 SQL · **L5** 실측.
- 이 문서는 **L1 만 실행**했다. L2~L5 는 실행하지 않았고 전부 NOT_PROVEN 이다. 운영 DB·테스트 DB 접근 0.
- 판정 표기
  - **L1 PASS** — 그 홉이 TS 로 전부 결정되고 L1 테스트가 PASS.
  - **L1 부분 PASS** — TS 부분은 PASS, 나머지(DB 트랜잭션·화면 표시·실측)는 표기한 상위 층 필요 → 그 상위 층은 NOT_PROVEN.
  - **Lx 필요** — L1 로 결정할 수 없는 셀. NOT_PROVEN.
  - **해당 없음** — 설계 표가 「—」·「해당 없음」.
- 테스트 표기 `경로 :: describe 또는 it 이름(요지)`. 새 파일 5개는 `lib/stage5/__tests__/` 아래.

## 0. 집계

| 시나리오 | 셀 (케이스×5홉) | L1 PASS | L1 부분 PASS | L1 없음 (Lx 전용) | 해당 없음 |
|---|---|---|---|---|---|
| S06 환불 역거래 | 4×5 = 20 | 5 | 14 | 1 (L5) | 0 |
| S07 정지·승인 | 4×5 = 20 | 6 | 13 | 1 (L5) | 0 |
| S08 서비스 지역 | 4×5 = 20 | 8 | 8 | 4 (L5) | 0 |
| S09 광고 | 5×5 = 25 | 14 | 8 | 3 (L5) | 0 |
| S10 캐시·Coin | 3×5 = 15 | 3 | 5 | 2 (L2/L4) | 5 |
| **합계** | **100** | **36** | **48** | **11** | **5** |

- L1 부분 PASS 48셀이 기다리는 상위 층: **L2 25 · L3 8 · L5 15**. L1 없음 11셀: **L2/L4 2 · L5 9**.
- 결과 구분: 로컬 L1 PASS / Preview NOT_PROVEN / Production NOT_PROVEN / 실기기 NOT_PROVEN. 운영 주소(samarket.vercel.app)는 main 반영 전에는 바뀌지 않는다(이 묶음은 테스트·문서만).
- 추가 확인: S08 진입점 판정 하위 매트릭스 **7 진입점 × 8 상태 = 56셀** (§3-1) 전부 L1 PASS.

## 1. S06 환불 — 쿠폰·상품권·Coin 역거래

케이스: K1 매장 부담 쿠폰 · K2 플랫폼 부담 쿠폰 · K3 상품권 사용 · K4 완료 후 환불(Coin 역분개).
새 파일: `lib/stage5/__tests__/s06-refund-reversal-paths.test.ts` (24 tests).

| 케이스 | 홉 | L1 테스트 | 판정 |
|---|---|---|---|
| K1·K2·K3 | 주문자 행동 (취소) | s06 :: 「{케이스}: 주문자 접수 전 취소 → store_order_cancel_direct_atomic 1회」 · `lib/stores/__tests__/apply-store-order-status-g1-stage1.test.ts` :: stage 2-C 「%s cancel from %s … no TS money RPC / order write」 | L1 PASS (3셀) |
| K4 | 주문자 행동 (완료 후 환불 요청) | 환불 요청 화면·흐름 | L5 필요 — NOT_PROVEN |
| K1~K4 | 오너 화면 (환불 승인·금액·할인 분할) | 승인 동작: s06 :: 「{케이스}: OWNER refund_requested → refunded = gift_certificate_refund_order_atomic 1회」, 취소 승인: s06 :: 「구매자 취소 요청 → 오너 승인 → store_order_cancel_request_decide_atomic 1회」 · 분할 표시 화면은 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN (4셀) |
| K1~K4 | 서버·DB (같은 TX 역거래, 멱등키 1회) | s06 :: 「상태 + 역거래 = DB 함수 1회, TS 역거래 0」 9건 · 「같은 환불 재요청(DB idempotent) → 재고·알림 부수효과 0」 · 「환불 DB 함수 계약: coin_reversal:order:{id} · 쿠폰 복원 · 상태 갱신이 한 함수 본문」 · g1-stage1 :: 「migration: every cancel function runs the side effects; refund RPC reverses Coin + coupon in its TX」 · 「NTF-05 … RPC idempotent:true」 · `lib/currency/__tests__/coin-reversal-cut-b.test.ts` :: 「is idempotent via idempotency_key lookup」 | L1 부분 PASS + **L2 NOT_PROVEN** (실패 주입 → 상태 롤백, 역거래 정확히 1회) (4셀) |
| K1~K4 | 관리자 화면 (쿠폰 reversed 이력·상품권 역처리 1행·Coin 역분개 1행) | g1-stage1 migration 계약(쿠폰 복원 `DELETE` 없음 · `SET status = 'restored'` · `reversed_at IS NULL` 부분 UNIQUE) · `lib/gift-certificate/__tests__/stage2-2d-gift-contract.test.ts` :: 「GFT-01: reverse locks the order and refuses non-terminal orders」 | L1 부분 PASS + L2/L4(I-5·I-6)/L5 NOT_PROVEN (4셀) |
| K1·K2 | 주문자 결과 (쿠폰함 복원, 만료 전) | s06 :: 「restored(만료 30일 후) → available·장바구니 선택 가능, restored(만료 지남) → expired·선택 불가」 · 「체크아웃·자동 추천이 restored 를 사용 가능 상태로 받는다」 | L1 PASS (2셀) |
| K3 | 주문자 결과 (상품권 잔액 복원, 만료 D-20) | g1-stage1 :: 「GFT-05: an expired gift restored by the cancel is flagged in the status event (restored_expired)」 · `components/stores/cart/__tests__/store-cart-gift-forfeit-consent.test.tsx` | L1 부분 PASS + L2 NOT_PROVEN |
| K4 | 주문자 결과 (매장 직접 결제 환불 안내) | `lib/stores/__tests__/three-party-order-money-ssot.test.ts` :: 「buyer copy never mixes store settlement / fee terms with the customer refund」 | L1 부분 PASS + L5 NOT_PROVEN |

PASS 조건 중 「refunded/cancelled 인데 복원 미실행 0 · 복원만 실행 0 · 3원장 합 = 할인·상품권·Coin」은 DB 트랜잭션 결과라 **L2(ND-3)·L4(I-5·I-6)** 로만 증명된다. L1 이 증명한 것은 TS 경로가 그 상태를 만들 수 없다는 점(상태와 역거래가 같은 DB 함수로만 감)이다.

## 2. S07 매장 정지·승인 → 오너 접근·주문자 노출

케이스: 승인 · 정지 · 정지 해제 · 오너 탈퇴(ACC-03).
새 파일: `lib/stage5/__tests__/s07-store-suspension-gate-matrix.test.ts` (136 tests).

| 케이스 | 홉 | L1 테스트 | 판정 |
|---|---|---|---|
| 승인·정지·해제·탈퇴 | 주문자 행동 (홈·검색·상세·배너·결제 시도) | s07 :: 「주문자: 정지·미승인 매장 직접 URL 결제 거부」(suspended·pending·rejected → 400 store_unavailable, 주문 RPC 0) · 「탈퇴 사장 매장(approved·is_visible=false) → store_unavailable」 · 「approved + 노출 → 매장 게이트 통과」 · `lib/stores/advertising/__tests__/delivery-ad-stage3-3d1.test.ts` :: ADS-06 3건 · 목록·검색 SQL 필터는 L1 없음 | L1 부분 PASS + L3 NOT_PROVEN (4셀) |
| 승인·정지·해제 | 오너 화면 (정지 OwnerStateView·진행 주문만, 승인 전 메뉴, 심사 중 프로필) | `components/business/owner/__tests__/owner-stage4-primitives.test.tsx` :: 「gate kinds show reason + allowed link」(suspended) · `lib/business/__tests__/owner-nav-registry-stage4.test.ts` :: IA-21 「%s — drawer items match expected matrix」「visible ⇔ server gate ⇔ StoreBusinessGuard path gate」「onboarding routes stay open for pending」 | L1 PASS (3셀) |
| 탈퇴 | 오너 화면 | 탈퇴 계정 접근 불가 확인 | L5 필요 — NOT_PROVEN |
| 정지 | 서버·DB (운영 쓰기 403 store_suspended, REST 직접 해제 42501, 주문 RPC 정지 거부) | s07 :: 「approval_status × 오너 운영 쓰기 라우트 게이트 매트릭스」 19 라우트 × {suspended→store_suspended, pending·under_review·revision_requested·rejected→store_not_approved} = 95건 + approved 통과 19건, 차단 시 쓰기·RPC 0 · 「delivery-service-areas PUT」 온보딩 허용/정지·반려 차단 · 「orders/** 는 운영 쓰기 게이트 미사용(D-16)」 · 쿠폰: `app/api/me/store-coupons/campaigns/__tests__/owner-create-funding-route.contract.test.ts` :: 「CASE 6 suspended store → 403 store_suspended」 · `owner-coupon-transition-route.test.ts` :: 「suspended store → 403 gate (1-B)」 · 상품: `owner-product-3e.route.test.ts` :: 「suspended store → 403 store_suspended」 · `lib/stores/__tests__/owner-lifecycle-and-write-gate.test.ts` :: 「owner write gates」 · RLS 42501·주문 RPC 정지 거부는 L1 없음 | L1 부분 PASS + L2 NOT_PROVEN |
| 승인·해제 | 서버·DB | s07 :: 관리자 PATCH 「승인: under_review → approved」「정지 해제: suspended → approved + 노출 복구」「비허용 전이 … 409 invalid_store_transition」 + 게이트 매트릭스 approved 통과 | L1 PASS (2셀) |
| 탈퇴 | 서버·DB | s07 :: 「withdraw → stores.is_visible=false + 판매 권한 suspended upsert + 감사 + 오너 알림」「suspend(회원 정지) → 노출 플래그 불변」「관리자 회원 삭제 라우트가 withdraw 제재를 호출」 | L1 PASS |
| 승인·정지·해제·탈퇴 | 관리자 화면 (상태·감사 이력, 진행 주문) | s07 :: 「정지: … 사유 필수, 감사 1·오너 알림 1·공용 캐시 bump」 · `app/api/admin/stores/[id]/__tests__/admin-store-reopen-reverify.route.test.ts` · ACC-03 감사 1 · 화면 표시는 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN (4셀) |
| 승인·정지·해제·탈퇴 | 주문자 결과 (목록·검색·배너 미노출, 직접 URL 결제 거부, 진행 주문 계속) | 결제 거부·배너 자격(위 행) · 진행 주문 라우트 게이트 미사용(s07 D-16) · 공용 캐시 세대 bump(s07 정지) · 목록·검색 노출은 SQL RPC·화면 | L1 부분 PASS + L3 NOT_PROVEN (4셀) |

## 3. S08 서비스 지역 변경 → 7 진입점 판정

케이스: C1 반경 축소 · C2 좌표 이동 1km 초과 · C3 V2 지역 교체 · C4 좌표 없는 매장·정책 OFF·설정 조회 실패.
새 파일: `lib/stage5/__tests__/s08-service-area-entrypoint-matrix.test.ts` (9 tests). 7 진입점을 실제 코드 경로로 실행하고, `evaluateDeliveryServiceArea` 를 감싼 spy 로 각 진입점이 단일 판정을 호출했는지·결과가 같은지 확인한다.

| 케이스 | 홉 | L1 테스트 | 판정 |
|---|---|---|---|
| C1~C4 | 주문자 행동 (같은 대표 주소로 7 진입점) | s08 :: 「C1 반경 축소」「C2 좌표 이동 1km 초과」「C3 V2 지역 교체」「C4a~C4e」 · 「판정 단일화 배선」 | L1 PASS (4셀) — 하위 56셀 §3-1 |
| C1 | 오너 화면 (기본정보·배달 설정 저장) | `app/api/me/stores/[storeId]/__tests__/owner-store-patch-ops-3b.route.test.ts` · `owner-store-patch-audit-reverify.route.test.ts` :: 「ACC-06 + OPS-02: operating info change = audit only … + cache bump」 · 저장 화면은 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN |
| C2 | 오너 화면 (1km 초과 확인창, LOC-007) | `owner-store-patch-location-guards.route.test.ts` :: 「LOC-007: move > 1 km without confirmation → 409, nothing written」「pin in another LGU … 409 lgu_mismatch」「confirmLocationMove:true → saved, audited」 · 확인창 UI 는 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN |
| C3 | 오너 화면 (V2 편집기 409 동시 저장) | `delivery-service-areas/__tests__/loc-006-replace-contract.route.test.ts` :: 「stale version → 409 service_areas_version_conflict, no audit」「PUT forwards expectedAreasVersion and writes an owner audit row」 | L1 부분 PASS + L5 NOT_PROVEN |
| C4 | 오너 화면 (좌표 없이 배달 ON 저장) | `owner-store-patch-location-guards.route.test.ts` :: 「LOC-005: DB guard violation maps to 400 store_delivery_requires_canonical_geo」 | L1 부분 PASS + L5 NOT_PROVEN |
| C1~C4 | 서버·DB (좌표 실변경만 후처리 → 감사 → 지역 교체 원자 → 단일 판정 → 주문 시 스냅샷) | location-guards :: 「LOC-013: … no checkout-geo refresh」「real small move → refresh exactly once」 · `lib/delivery/service-area/__tests__/replace-store-delivery-service-areas-rpc.test.ts` · `lib/delivery/__tests__/loc-003-serviceability-fail-closed.test.ts` · `lib/stores/__tests__/loc004-order-serviceability-snapshot.test.ts` · 트리거·RPC 원자성은 L1 없음 | L1 부분 PASS + L2 NOT_PROVEN (4셀) |
| C1~C4 | 관리자 화면 (위치·지역·감사, 주문 상세 「주문 당시 판정」) | 없음 — **TS/TSX 어디에도 `checkout_serviceability_*` 를 읽는 화면 코드가 없음** (§6-1) | L5 필요 — NOT_PROVEN (4셀) |
| C1~C4 | 주문자 결과 (7 진입점 판정 동일, 거부 사유 코드 정확) | s08 전체 + `lib/stores/__tests__/resolve-store-checkout-client-error.test.ts` :: 「maps V2 unresolved member LGU to a distinct copy (not coords)」 · `lib/stores/__tests__/delivery-ordering-eligibility.test.ts` | L1 PASS (4셀) |

### 3-1. 진입점 × 상태 하위 매트릭스 (변경 후 상태, 판정 = eligible/reason → 주문자 결과 O 가능·X 불가)

진입점 실행 경로: HOME = home-feed 행 OOR 조합(route L352·L578 과 같은 호출) · BROWSE = `resolveBrowseFilteredSortedStoreRows` · SEARCH = `resolveDeliverySearchStoreEligibility`+`isDeliverySearchStoreVisible` · ORDER NOW = `resolveDiscoveryOorWithServiceAreaAuthority`(NEW 권한 순위 재매핑) · 상세 = `GET /api/stores/[slug]/delivery-serviceability` · 장바구니 = 같은 응답 → `isDeliveryDistanceOrderBlocked` · 체크아웃 = `POST /api/me/store-orders`.

| 상태 | HOME | BROWSE | SEARCH | ORDER NOW | 상세 | 장바구니 | 체크아웃 |
|---|---|---|---|---|---|---|---|
| C1 반경 10→3km (매장 5km) | false/out_of_range X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X (`store_cart_delivery_unavailable_body`) | 같음 X (`delivery_out_of_range`) |
| C2 0.9km→12km (반경 10) | false/out_of_range X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X (`delivery_out_of_range`) |
| C3 선택 [A]→[B], 회원 A | false/unselected_lgu X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X (`delivery_out_of_range`) |
| C4a 좌표 없음·정책 ON | false/missing_store_coords X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X (`store_err_delivery_store_coords_required`) | 같음 X (`delivery_store_coords_required`) |
| C4b 좌표 없음·정책 OFF | false/missing_store_coords X | 같음 X | 같음 X | 판정 생략(축 OFF) — 선반은 HOME 행 플래그 X | 같음 X | 같음 X | 같음 X (`delivery_store_coords_required`) |
| C4c 좌표 있음·정책 OFF | true/policy_off O | 같음 O | 같음 O | 판정 생략 O | 같음 O | 같음 O | 같음 O (주문 RPC 도달) |
| C4d 설정 조회 실패·좌표 없음 | false/missing_store_coords X | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X | 판정 전 503 `delivery_policy_unavailable` X |
| C4e 설정 조회 실패·좌표 있음(50km, 반경 3) | false/out_of_range X (fail-closed 정책 ON) | 같음 X | 같음 X | 같음 X | 같음 X | 같음 X | 판정 전 503 `delivery_policy_unavailable` X |

- 변경 전 상태(C1 10km·C2 0.9km·C3 [A])는 7곳 모두 `eligible`/`selected_lgu` O — 같은 테스트에서 확인.
- C4b·C4c 의 ORDER NOW: 정책 OFF 이면 home-feed(`distanceAxisEnabled = policy.enabled && hasGeo`)가 순위 재매핑을 생략한다. 주문자에게 보이는 「지금 주문 가능」 선반 멤버십은 `stores-home-composer` 의 `isNormalListEligible`(= home-feed 행 `distanceOutOfRange`, 위 HOME 셀)로 정해지므로 결과는 HOME 과 같다. 순위(정렬)만 영향 — 결함 아님.
- C4d·C4e 체크아웃 503 은 LOC-003 §3(b) 설계(주문 경로는 정책 조회 실패 시 503, 목록·상세는 마지막 성공값/없으면 fail-closed). 어떤 진입점도 조회 실패를 정책 OFF(`policy_off` → 주문 가능)로 바꾸지 않는다 → fail-closed PASS.
- 경계 0,0·고객 좌표 누락(LOC-010)은 기존 L1: `loc-003-serviceability-fail-closed.test.ts` :: 「LOC-010 order route applies DELIVERY_ROUTABLE (0,0 rejected)」, `lib/store-commerce/__tests__/cart-address-change-policy.test.ts`.

## 4. S09 광고 제출·승인·반려·환불

케이스: A 정상 승인 · B 지연 승인(기간 재계산) · C 반려 환불 · D 만료 미심사 자동 반려 · E 파트너 동시 결정.
새 파일: `lib/stage5/__tests__/s09-ad-review-refund-routes.test.ts` (14 tests).

| 케이스 | 홉 | L1 테스트 | 판정 |
|---|---|---|---|
| A | 주문자 행동 (노출 열람·클릭) | s09 :: 「승인 기간 중 → schedule_active 판정」 · `delivery-ad-3d2-event-ids.test.ts` :: 「same token posted twice … same server eventId」 | L1 PASS |
| B | 주문자 행동 | s09 기간 판정(이동된 기간 값은 DB 가 정함) | L1 부분 PASS + L2 NOT_PROVEN |
| C·D | 주문자 행동 | s09 :: 「반려·만료 자동 반려·미심사(%s) 캠페인은 기간 중이어도 노출 안 됨 (campaign_ACTIVE)」 | L1 PASS (2셀) |
| E | 주문자 행동 | `delivery-ad-3d2-partner-atomic.test.ts` :: 「ACTIVE / CANCEL_PENDING past period_end is expired and not open」 | L1 PASS |
| A | 오너 화면 (서버 산출 기간·인벤토리, Cash 차감 확인) | `delivery-ad-stage3-3d1.test.ts` :: ADS-02 「start/end 수정 → schedule_locked」「다중 인벤토리 → inventory_single_required」 · `delivery-ads/[campaignId]/actions/__tests__/atomic-submit.route.test.ts` · 확인창 UI 는 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN |
| B·C·D | 오너 화면 (상세 기간·상태·환불 표시) | 없음 | L5 필요 — NOT_PROVEN (3셀) |
| E | 오너 화면 (파트너 신청 1 RPC) | 3d2-partner :: 「calls owner_apply_partner_membership with the request id」「maps insufficient Cash, already_open …」 | L1 PASS |
| A | 서버·DB (제출 RPC Cash 차감+스냅샷, 승인 RPC) | `v3-04-atomic-reject-submit.test.ts` :: 「owner submit — debit + transition single RPC」 4건 · 「non-reject actions keep using admin_delivery_ad_transition directly」 | L1 부분 PASS + L2 NOT_PROVEN |
| B | 서버·DB (승인 기간 재계산 ADS-01) | 3d1 :: 「승인 용량 확인 기간 미리보기 = 승인 시점 기준 이동 (길이 유지)」 | L1 부분 PASS + L2 NOT_PROVEN |
| C | 서버·DB (반려 RPC 환불 같은 TX) | v3-04 :: 「calls admin_delivery_ad_reject_with_refund only」「refund failure inside the transaction → reject_refund_failed」「RPC missing → reject is refused」 · s09 :: 「같은 TX 환불 실패 → 2xx 아님」 | L1 부분 PASS + L2 NOT_PROVEN |
| D | 서버·DB (크론 expire_unreviewed, 신청 기준 이후만) | 3d1 :: 「expire_unreviewed: 기간 경과 + 적용 시점 이후 제출만」「배치: 미심사 만료 후보를 expire_unreviewed 로 DB 함수에 넘기고 expired 집계」 | L1 부분 PASS + L2 NOT_PROVEN |
| E | 서버·DB (파트너 결정 RPC ADS-03) | 3d2-partner :: 「reject passes action + reason and returns refund idempotency」「approve … maps funding_required / illegal_transition」 · s09 :: 「첫 reject 성공(감사 1) → 두 번째 reject 는 DB illegal_transition → 400, 추가 감사 0」 · 실제 동시 실행은 L1 없음 | L1 부분 PASS + L2 NOT_PROVEN |
| A·B | 관리자 화면 (business 권한만 승인) | 3d1 :: ADS-08 「delivery-ads actions: 권한 없음 → 403, writer 미호출」「business 권한 → permission actor 로 writer 호출」 | L1 PASS (2셀) |
| C | 관리자 화면 (반려=환불 권한) | s09 :: 「반려(환불) 라우트 3종: business 권한키 필수」 3건 · 「광고 reject: … 사유가 writer 로 전달」 · 「팝업 reject: 사유 없으면 400」 | L1 PASS |
| D | 관리자 화면 (미펀딩 분리 큐) | 3d1 :: ADS-12 「OWNER_PAID review + 펀딩 없음 → review_unfunded」 | L1 PASS |
| E | 관리자 화면 (파트너 결정 권한) | 3d1 :: 「partner memberships POST: 권한 없음 → 403」 · s09 :: 「파트너 reject: 권한 없음 → 403」 | L1 PASS |
| A·C·D | 주문자 결과 (승인 기간에만 노출, 정지 매장 미노출) | s09 :: 「승인 기간 전/중/종료 후」「반려·만료·미심사 미노출」「정지(자격 집합 밖) 매장 배너 store_eligible 탈락」 · 3d1 ADS-06 3건 | L1 PASS (3셀) |
| B | 주문자 결과 | 판정 함수 PASS, 재계산된 기간 값은 DB | L1 부분 PASS + L2 NOT_PROVEN |
| E | 주문자 결과 | 3d2-partner :: 「in-period ACTIVE and PENDING_REVIEW stay open; ENDED / REJECTED never open」 | L1 PASS |

## 5. S10 캐시 충전 · Coin→Cash 전환 · Coin 출금

케이스: T 충전 · V Coin→Cash 전환 · W Coin 출금.
새 파일: `lib/stage5/__tests__/s10-cash-coin-idempotency-routes.test.ts` (12 tests). DB 멱등은 키→행 맵으로 흉내만 낸다(실제 UNIQUE·같은 행 반환은 L2).

| 케이스 | 홉 | L1 테스트 | 판정 |
|---|---|---|---|
| T·V·W | 주문자 행동 | 설계 「해당 없음(S02 연동)」 | 해당 없음 (3셀) |
| T | 오너 화면 (참조번호·폼 고정 키) | `lib/stores/advertising/__tests__/stage2a-cash-charge-fin04-fin08.test.ts` :: IA-22 「keys live in form state, are sent as-is, and are replaced only after success」「same form submitted twice sends the same key」「top-up form requires a deposit reference」 | L1 PASS |
| V | 오너 화면 (확인창·견적 버전) | IA-22 :: 「keys live in form state」(`sp2bc` 키) · 확인창 UI 는 L1 없음 | L1 부분 PASS + L5 NOT_PROVEN |
| W | 오너 화면 (확인창·계좌) | IA-22 :: 「withdrawal asks for confirmation first」「keys live in form state」(`coin_withdrawal`) | L1 PASS |
| T | 서버·DB (owner_create… PENDING 1건, 미납 상계 FIN-02) | s10 :: 「같은 키 2회 → DB 함수에 같은 키, 같은 requestId, 두 번째 idempotent:true, 테이블 직접 쓰기 0」「키 없음 → 400 idempotency_required」「같은 키 + 다른 금액 → 409」 · stage2a :: 「calls owner_create_business_cash_charge_request with evidence + the caller's key; never touches the table」「passes DB refusal codes through (pending_request_exists …)」「FIN-02 / FIN-12 SQL wiring」 | L1 부분 PASS + L2 NOT_PROVEN (PENDING 1건·같은 금액 2회 부분 상계 UNIQUE) |
| V | 서버·DB (convert_store_economic_points_to_business_cash) | s10 :: 「같은 키 2회 → … 전환 1건」「견적 버전 변경(stale_rate) → 409」「키 없음 → 400」 | L1 부분 PASS + L2 NOT_PROVEN |
| W | 서버·DB (coin_withdrawal_request) | s10 :: 「같은 키 2회 → 같은 requestId (201)」「키 없음 → 400」「잔액 초과 → 400」 · `lib/stores/__tests__/store-finance-withdrawals-session-ssot-19.test.ts` | L1 부분 PASS + L2 NOT_PROVEN |
| T | 관리자 화면 (충전 승인 큐, 관리자 신원·자기 매장 금지) | s10 :: 「business 권한 없음 → 403」「사유 없음 → 400」「같은 요청 승인 2회 → idempotent:true」 · stage2a :: 「SQL: approval re-checks platform admin, refuses self-store and no-reference」 | L1 부분 PASS + L2 NOT_PROVEN |
| V | 관리자 화면 | 전환은 관리자 큐 없음 | 해당 없음 |
| W | 관리자 화면 (출금 지급 큐, 참조번호) | `lib/admin/__tests__/admin-payout-reference-ssot-19.test.ts` :: 「POST /api/admin/coin-withdrawals mark_paid」 4건 | L1 PASS |
| T·V | 주문자 결과 (다음 주문 수수료 차감 시 미납 0) | 상계 결과는 DB | L2/L4(I-3·I-4) 필요 — NOT_PROVEN (2셀) |
| W | 주문자 결과 | 출금은 주문 수수료와 무관 | 해당 없음 |

## 6. 발견 사항

### 6-1. 기능 누락 (수정 안 함 — 보고)
- **LOC-004 연동 「관리자 주문 상세 『주문 당시 판정』 표기」 미구현.** 문서 G-2 LOC-004 4. 연동 · S08 관리자 홉이 요구한다. 근거: 주문 시 스냅샷은 `app/api/me/store-orders/route.ts:604-663` 이 만들어 `lib/stores/create-store-order-atomic.ts:41-45` 로 RPC 에 넘기지만, `components/`·`app/`·`lib/` 의 어떤 화면·로더도 `checkout_serviceability_*`·`checkout_store_latitude` 를 읽지 않는다(`grep -rn checkout_serviceability --include=*.ts --include=*.tsx` 결과가 위 두 파일뿐). 새 화면 표시(관리자 주문 상세 로더·컴포넌트)가 필요해 「작고 명확한 최소 수정」 범위를 넘으므로 고치지 않았다.

### 6-2. 결함 아님 (확인 결과)
- ORDER NOW 순위 재매핑이 정책 OFF 일 때 판정을 생략하는 것 — 선반 멤버십은 행 플래그(단일 판정)로 정해져 주문자 결과가 같다(§3-1).
- LOC-009 오류 코드 이름이 설계 문구(`delivery_address_lgu_unresolved`)와 다른 `delivery_customer_lgu_unresolved` — 서버(`store-orders/route.ts:671`)·클라 매핑·i18n 이 같은 값으로 일치해 동작 차이 없음.

### 6-3. 실패 테스트
- 없음. 새 테스트 5파일 195건 PASS, 매트릭스가 참조한 기존 테스트 34파일 395건 PASS. 운영 코드 수정 0.

## 7. 실행한 검증 (로컬 1회)
- `npx vitest run lib/stage5` → 5 files · 195 tests PASS.
- 참조 기존 테스트 34 files · 395 tests PASS (S06~S10 매핑 대상).
- `npx eslint lib/stage5/__tests__/*.ts` → 0 problems.
- `rm -rf .tsbuild && NODE_OPTIONS=--max-old-space-size=7168 npm run typecheck:test` → 오류 0.

## 8. 남은 위험
- L1 은 Supabase mock 이다. 역거래 같은 TX·멱등 UNIQUE·트리거·RLS·주문 RPC 정지 거부·지역 교체 원자성은 **L2(ND-3) 전까지 NOT_PROVEN**, 운영 반영 후 L4(I-3~I-6·I-8~I-11) 1회로만 확인 가능.
- 목록·검색의 정지 매장 제외는 SQL RPC 필터라 L1 로 증명하지 않았다(L3 읽기 필요).
- 화면 표시(오너 환불 분할·관리자 이력·광고 상세 기간·확인창)는 L5 실측 전 NOT_PROVEN.
