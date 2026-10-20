# FIN — 금전(코인·캐시·지갑·수수료·정산·환불) 감사

- 감사일: 2026-10-20 (PHT) · 대상: 배달 매장 사장님(오너) 금전 도메인 · 저장소 HEAD `8c151baa`
- 운영 DB: `ckdosyydvgzqwpbwuhon` **읽기 전용** (pg_catalog / information_schema / pg_policies / pg_trigger / pg_proc + 집계 COUNT/SUM, STABLE 조회 함수만 호출). 데이터 변경 0건. 테스트 DB 접근 0건.
- 판정: PASS = 코드·DB 증거 확인 · FAIL = 결함 확인 · NOT_PROVEN = 증거 부족(관리자·오너 로그인 런타임은 전부 NOT_PROVEN)

---

## 0. 먼저 확정한 자산 정의 (스키마 + 정책)

| 자산(제품명) | 소유 | 잔액 / 원장 | 단위 | 충전 | 사용 | 출금 | 근거 |
|---|---|---|---|---|---|---|---|
| **POINT (포인트)** — 회원 지갑 | 회원 `user_id` | `point_ledger` 합계 SSOT, `profiles.points` 는 투영 캐시 | 정수 포인트 | 회원 충전 요청 | 상품권 구매·광고 홀드 등 | 불가 | `docs/dibay-currency-ssot-hard-lock.md` §2 POINT |
| **COIN (Coin)** — 오너 "points" 페이지 | 매장 `store_id` | `store_economic_point_accounts.balance`(integer, **음수 허용·CHECK 없음**) / `store_economic_point_ledger`(UPDATE·DELETE 금지 트리거, idempotency UNIQUE) | 정수 Coin, 전환율 `business_cash_conversion_rate_policies.default` = **₱1.00/Coin v5** | **불가** | Cash 전환(`convert_store_economic_points_to_business_cash`) | 가능(`coin_withdrawal_requests`, 관리자 지급 처리) | 운영 컬럼·제약 조회, hard-lock §2 COIN |
| **CASH (캐시 · "business cash")** | 매장 `store_id` | `business_cash_accounts.balance_minor`(bigint, **CHECK ≥ 0**) / `business_cash_ledger`(amount_minor > 0, direction, balance_after, idempotency UNIQUE, UPDATE·DELETE 금지 트리거) | **centavo(minor)** | 충전 요청 → 관리자 승인 | 판매 수수료(SALE_FEE·SALE_FEE_SETTLEMENT)·배달 광고(AD_SPEND)·제휴(PARTNER_SPEND) | **불가** | 운영 제약 조회 |
| 미납 수수료 | 매장 | `store_sale_fee_obligations`(주문당 1행 UNIQUE, paid+outstanding=due CHECK) | centavo | — | 충전·전환 시 오래된 순 상계 | — | 운영 제약 조회 |
| 상품권 매출(gift rail) | 매장 | `gift_certificate_revenue_ledger`(REVENUE_CREATE/AVAILABLE/REVERSED/CONVERSION…) | PHP 정수, 플랫폼 수수료 10% 차감 후 merchant_net | — | (과거) Coin 전환·현금화 → **현재 API 410** | — | §FIN-03 |
| 레거시(제품 아님) | 매장 | `stores.point_balance`·`store_point_ledger`(AST-002), `store_cash_accounts`·`store_cash_ledger`(구 상품권 캐시), `delivery_ad_accounts` | — | 410 | — | — | hard-lock §Historical; 운영: point_balance ≠ 0 매장 14곳 합 77,217,484, 마지막 원장 2026-08-28 |

결론
- **COIN ≠ CASH ≠ POINT** — 테이블·작성자·UI 가 분리되어 있고, 오너 지갑(store_id)과 회원 지갑(user_id)은 완전히 분리된다(PASS).
- `/stores/owner/points`·`/stores/owner/business-cash`·`/my/business/settlements` 는 모두 리다이렉트 전용 → 실화면은 `/stores/owner/finance`(Coin+Cash)·`/stores/owner/settlements`(수수료·캐시 원장).
- 상품권 구매는 **회원 POINT** 로 한다. 매장은 상품권 사용(redemption) 시 gift rail 매출을 얻는다. 매장 재화로 상품권을 사는 경로는 없다.
- 고객은 매장에 직접 결제(COD·매장 GCash·계좌) → 플랫폼은 `payment_amount` 를 보유하지 않으며 **주문별 지급(payout) 개념은 없다**. 플랫폼이 실제 보유하는 돈은 상품권 사용액 + 플랫폼 부담 쿠폰뿐이다.

---

## 1. 범위 및 조사 대상 목록

### 1-1. 문서 (8)
`docs/store-commission-cash-settlement-ssot.md`, `docs/dibay-currency-ssot-hard-lock.md`, `docs/dibay-owner-cash-charge-notify-wire-hard-lock.md`, `docs/dibay-delivery-ads-finance-approval-authority-design.md`(SUPERSEDED 확인), `docs/store-order-cancel-refund-decision-ssot.md`, `docs/admin/dibay-admin-delivery-ops-audit-design.md`(DEF-1~34 재사용), `AGENTS.md` 매장 정산 절, `lib/stores/commission/store-commission-contract.ts`

### 1-2. 화면 / 라우트 (14)
오너: `app/(main)/stores/owner/finance/page.tsx`, `.../settlements/page.tsx`, `.../points/page.tsx`(redirect), `.../business-cash/page.tsx`(redirect), `app/(main)/my/business/settlements/page.tsx`(redirect) · 컴포넌트 `OwnerStoreFinanceView`, `OwnerBusinessCashView`, `OwnerStoreSettlementsView`, `MyStoreSettlementsPage`(미사용)
관리자: `app/admin/store-settlements/page.tsx`(→ `AdminStoreCommissionLedgerPage`), `app/admin/delivery-orders/settlements`·`app/admin/stores/orders/settlements`(redirect), `app/admin/delivery-ads/cash-charges`, `app/admin/finance/*`(withdrawals·outstanding·stores·daily), `app/admin/store-fee-policies`

### 1-3. API (24)
`/api/me/stores/[storeId]/business-cash`(GET·POST topup/convert/quote), `/finance`, `/finance/withdrawals`, `/finance/transparent`, `/commission-ledger`(+`/cash-ledger`, `/payable`), `/points`(410), `/point-charges`(410), `/gift-certificates/cash-outs`(410), `/gift-certificates/conversions`(410) · `/api/me/store-settlements`(레거시) · `/api/admin/business-cash-charges`, `/api/admin/coin-withdrawals`, `/api/admin/store-commission-ledger`(+`/adjustments`, `/gate`, `/integrity`, `/payable`, `/cash-ledger`), `/api/admin/store-settlements`(GET 레거시 · `[settlementId]` PATCH 410), `/api/admin/store-fee-policies`(+`[id]`, `/overview`), `/api/admin/delivery-ads/business-cash/charge-requests/[id]`(410), `/api/admin/gift-certificates/conversions/[id]/approve`(410), `/api/admin/store-points/[storeId]/adjust`(410), `/api/cron/store-currency-recognition-reconcile`

### 1-4. TS 서버 모듈 (16)
`lib/stores/apply-store-order-status-transition.ts`, `adjust-store-settlement-on-refund.ts`, `cancel-store-settlement.ts`, `ensure-store-settlement.ts`, `load-store-settlement-financial-facts.ts`, `confirmed-sale-revenue.ts`, `store-fee-policy-resolve.ts`, `owner-product-gate.ts`, `lib/stores/commission/*`(contract·writer·loader·query), `lib/stores/advertising/canonical-business-cash-writer.ts`, `lib/currency/recognize-order-currency-on-completed.ts`, `currency-cutover-flags.ts`, `reconcile-order-currency.ts`, `lib/finance/daily-statement/load-daily-statement.ts`, `lib/admin/store-financial-statement/load-store-financial-statement.ts`, `lib/admin/finance-control-plane/load-finance-control-plane.ts`

### 1-5. DB 함수 (운영 배포 확인 26)
`store_orders_commission_lifecycle`, `store_commission_charge_order_internal`, `store_commission_debit_internal`, `store_commission_resolve_policy`, `charge_sale_fee_for_order`, `flag_store_commission_review`, `admin_decide_store_commission_adjustment`, `settle_store_sale_fee_obligations`, `reverse_sale_fee_for_order`(EXECUTE = postgres 만), `store_cash_position`, `store_cash_order_gate_mode`, `store_orders_enforce_cash_order_gate`, `store_commission_ledger_page`, `store_cash_ledger_page`, `store_commission_breakdown`, `store_platform_payable_page`, `store_commission_integrity_report`, `store_commission_enqueue_exception_notifications`, `store_commission_notify_review`, `store_commission_notify_charge_failure`, `approve_business_cash_charge_request`, `convert_store_economic_points_to_business_cash`, `credit_coin_from_confirmed_sale`, `reverse_coin_credits_for_order`, `coin_withdrawal_request`, `coin_withdrawal_mark_paid`, `gift_certificate_recognize_revenue_for_completed_order`, `gift_certificate_refund_order_atomic`, `create_store_order_atomic`

### 1-6. 테이블 (18) · 트리거 (7)
테이블: `business_cash_accounts`, `business_cash_ledger`, `business_cash_charge_requests`, `business_cash_conversion_rate_policies`, `store_economic_point_accounts`, `store_economic_point_ledger`, `coin_withdrawal_requests`, `store_sale_fee_obligations`, `store_commission_adjustments`, `store_settlements`, `store_fee_policies`, `store_orders`, `gift_certificate_redemptions`, `gift_certificate_revenue_ledger`, `admin_settings`, `stores`(point_balance), `store_cash_accounts`, `delivery_ad_accounts`
트리거: `trg_store_orders_commission_lifecycle`(**비활성 D**), `trg_store_orders_cash_order_gate`, `trg_store_orders_gift_revenue_recognition`, `business_cash_ledger_no_update`, `store_economic_point_ledger_no_update`, `store_commission_adjustments_no_mutation`, `trg_store_settlements_block_paid_when_coin_recognized`

### 1-7. 운영 집계 SQL (실행 결과 요약)

| 검사 | 결과 |
|---|---|
| Cash 계정 수 / 잔액 ≠ 원장 합계 | 2 / **1곳**(store `19085860…`, 잔액 − 원장 = −22,500 minor = −₱225) |
| Cash 음수 잔액 | 0 (CHECK ≥ 0) |
| Coin 계정 수 / 잔액 ≠ 원장 합계 / 음수 | 1 / 0 / 0 |
| 원장 중복 idempotency_key (Cash·Coin) / NULL 키 | 0 · 0 / 0 · 0 |
| 수수료 의무 주문 중복 / paid+outstanding≠due | 0 / 0 |
| 수수료 의무 총 13건, open 1건(미납 3,800 minor = ₱38), 검토 대기 0 | — |
| 조리 이후 상태 주문 538건 중 의무 없음 | **528** (대부분 SSOT 이전 주문) — 최근 40일 내 갱신 4건 포함(`SO1790254620754fa9f` ready_for_pickup 등) |
| `store_commission_integrity_report(null)` | balance_eq_ledger_sum 위반 1, 나머지 0 |
| `store_platform_payable_page(...,'payable')` 요약 | 완료 519 · 직접 수령 ₱3,238,434 · 플랫폼 보유 ₱21,040 · gift_rail ₱21,000(23건, 순 ₱18,900) · payable ₱40(1건) · 코인 초과 9,050 · 레거시 scheduled 501건 ₱3,119,420 · 레거시 paid 2건 ₱1,954 (SSOT 문서 수치와 일치) |
| Cash 원장 종류 | TOP_UP 20(₱17,878) · SALE_FEE 12(₱557) · SALE_FEE_SETTLEMENT 9(₱277) · SALE_FEE_REVERSAL 5(₱150) · AD_SPEND 20 · AD_REFUND 7 · PARTNER 5 · CONVERT 4 — **마지막 SALE_FEE 2026-09-15** |
| 충전 요청 | APPROVED 20(₱17,878) · REJECTED 7 · PENDING 0 |
| 코인 출금 | PAID 4(8 Coin) · REJECTED 3 |
| 차단 게이트 | `store_cash_order_gate = off` (2026-10-17 18:23 UTC) · 승인 매장 17곳 중 순잔액 > 0 = **1곳**, 음수 1곳 |
| 활성 수수료 정책 | 카테고리 7개 × 7% · 기본 0% · 배달비 모드 none · 정책 미해석 매장 0 |
| 상품권 사용 수수료 스냅샷 | 51건 10%, 1건 0% |
| 레거시 `store_settlements` 마지막 생성 | 2026-09-15 · 완료 주문 중 스냅샷 없는 주문 10건 |
| `supabase_migrations.schema_migrations` 최대 버전 | `20270520120000` — 그러나 `20270421*`, `20270510120000`, `20270512*`, `20270515*`, `20270523*`, `20270601*` 의 함수는 **운영에 존재**(기록 누락) |

조사 대상 합계: 문서 8 · 화면/라우트 14 · API 24 · TS 모듈 16 · DB 함수 29 · 테이블 18 · 트리거 7 · 운영 SQL 25회.

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 조리 시작 수수료 자동 부과 | 원장 표시 PASS | 상태 전이 후 TS 처리 없음(설계) | 함수 PASS / **트리거 비활성** | 부과 안 됨 | 10-17 이후 상태 전이 0건 → 실손 0, 다음 전이부터 미부과 | **FAIL** | `pg_trigger.tgenabled='D'`; `apply-store-order-status-transition.ts:441-442` |
| 조리 후 취소·환불 → 수수료 검토 대기 | PASS | — | 트리거 안 → **동작 안 함** | 검토 누락 | 해당 0건 | **FAIL**(FIN-01 동일 원인) | 위 |
| 관리자 수수료 환급 결정(전액/부분/반려) | 2단계 확인·사유·멱등 | super_admin + 감사 | FOR UPDATE·UNIQUE(obligation)·CHECK 7종·불변 트리거 | 관리자=오너 같은 SQL | legacy_auto 5건만 존재 | PASS(코드·DB) / 런타임 NOT_PROVEN | `adjustments/route.ts:26-91`; 운영 제약 조회 |
| 캐시 충전 요청 → 승인 | 금액 입력만 | owner 소유 확인, 키=Date.now() | 승인 RPC FOR UPDATE·멱등·상계 | 입금 증빙 없음 | 승인 20건 | **FAIL**(FIN-04) | `OwnerBusinessCashView.tsx:183-186`; 운영 컬럼 |
| 충전·전환 시 미납 상계 | — | — | 상계 키 충돌 | 같은 금액 2회 부분 상계 시 실패 | 현재 open 1건 | **FAIL**(FIN-02) | 운영 `settle_store_sale_fee_obligations` 정의 |
| Coin → Cash 전환 | 전환율 공개·확인 | 소유·멱등 필수 | FOR UPDATE·부족 검사·M-3 네임스페이스 | — | 4건 211 | PASS(코드) / 재시도 중복 NOT_PROVEN | `business-cash/route.ts:164-199`; 운영 정의 |
| Coin 출금 | — | 키 필수 | 소유·잔액 FOR UPDATE·홀드 원장 | 계좌 매 건 입력(등록 계좌 없음) | PAID 4 | PASS / 계좌 검증 누락 | 운영 `coin_withdrawal_request` |
| Coin 출금 관리자 지급 | 사유 필수 | business 권한 + 감사 | `coin_withdrawal_mark_paid` 참조번호 필수 | — | — | PASS(코드) | `coin-withdrawals/route.ts:76-140` |
| 판매 Coin 적립(플랫폼 보유분) | — | env 플래그 | sale_coin 멱등, paid 정산 차단 | gift gross 지급 vs gift net 원장 불일치 | 9월 3건 Coin+gift 매출 동시 | **FAIL**(FIN-03) | `recognize-order-currency-on-completed.ts:36-42` |
| 환불 시 Coin 역분개 | — | CAS 이후 별도 호출 | 함수 FOR UPDATE·멱등 | 실패 시 로그만 | 과거 REVERSAL 8 | **FAIL**(FIN-05, 비원자) | `apply-store-order-status-transition.ts:424-430` |
| 상품권 환불·취소 복원 | — | 원자 RPC | 행 잠금 | — | — | PASS(코드) | `store-order-cancel-refund-decision-ssot.md` §3 |
| 레거시 정산(store_settlements) 쓰기 중단 | — | 지급 PATCH 410 | writer off | 환불·취소 시 TS 가 여전히 수정 | 501 scheduled 잔존 | **FAIL**(FIN-06) | `adjust-store-settlement-on-refund.ts:116-139` |
| 관리자 일별·매장 재무제표 | 표시 | 레거시 스냅샷 기반 | — | 신규 완료 주문 누락 | 스냅샷 없는 완료 10건 | **FAIL**(FIN-07) | `load-daily-statement.ts:59-73` |
| 관리자=오너 수수료 숫자 일치 | 같은 컴포넌트 | 같은 SQL 함수 | — | — | 런타임 NOT_PROVEN | PASS(정적) | `me/stores/[storeId]/commission-ledger/route.ts:37-60` |
| 원장 불변(append-only) | — | — | Cash·Coin·결정 UPDATE/DELETE 트리거 | — | 위반 0 | PASS | 운영 pg_trigger |
| 음수 잔액 방지 | — | — | Cash CHECK ≥ 0 / Coin 음수 허용(정책) | — | 음수 0 | PASS | 운영 pg_constraint |
| 이중 부과·이중 적립 방지 | — | — | 의무 order_id UNIQUE, 원장 idem UNIQUE, 결정 UNIQUE | — | 중복 0 | PASS | 운영 집계 |
| 관리자 수동 조정(Cash/Coin) | 없음 | 없음 | ADMIN_ADJUST 종류만 존재 | ₱225 불일치 정정 불가 | 위반 1 지속 | **FAIL**(FIN-08) | 운영 무결성 보고 |
| 원장 테이블 권한 | — | — | Cash 회수 완료 / Coin·출금·gift 원장 DML+TRUNCATE 잔존 | — | — | **FAIL**(FIN-09) | 운영 role_table_grants |
| 순잔액 ≤ 0 신규 주문 차단 | 정책 화면·사유 | business + 감사 | INSERT 트리거 활성 | OFF 운영 | 16/17 매장 대상 | PASS(코드) / 정책 미결 | `gate/route.ts:16-46` |
| 수수료 정책 변경 | super_admin·감사·원자 대체 | PASS | `admin_supersede_store_fee_policy` 배포 | — | — | PASS (DEF-1~3 해소 확인) | `store-fee-policies/route.ts:254-256`, `[id]/route.ts:161-164` |
| CSV·증빙 출력 | 없음 | 없음 | — | — | — | 누락(§4) | grep `text/csv` 결과 |
| 배포 상태 추적 | — | — | 마이그레이션 기록 누락 | — | — | **FAIL**(FIN-10) | 운영 schema_migrations |

---

## 3. 결함 목록

### FIN-01 · 운영 수수료 트리거 비활성 — 수수료 미부과·취소 검토 누락
- **영역**: DB 트리거 / 수수료
- **증상**: 운영 `trg_store_orders_commission_lifecycle` 의 `tgenabled = 'D'`(비활성). 함수 본문은 저장소와 동일하지만 실행되지 않는다.
- **원인**: SQL `SELECT tgname, tgenabled FROM pg_trigger … relname='store_orders'` → `trg_store_orders_commission_lifecycle | D` (같은 테이블의 `trg_store_orders_cash_order_gate`·`trg_store_orders_gift_revenue_recognition` 은 `O`). 저장소 어디에도 `DISABLE TRIGGER` 가 없다(grep 0건) → 운영에서 수동으로 비활성화된 것으로 보이며, 시점·주체는 NOT_PROVEN. 앱은 트리거가 권위라며 TS 처리를 하지 않는다(`lib/stores/apply-store-order-status-transition.ts:441-442`). 무결성 보고·예외 스캔에 "조리 이후 상태인데 의무 없음"이나 "트리거 비활성" 검사가 없다(`20270510120000_store_commission_cash_ssot.sql` §9·§9b).
- **영향**: 금전(플랫폼) — 모든 신규 주문의 조리 시작 수수료(7%)가 부과되지 않음. 조리 이후 취소·환불의 검토 대기 전환과 관리자 알림도 동작하지 않음. 오너·관리자 원장은 "부과 0" 을 정상처럼 표시함.
- **심각도**: **P0** (시스템 전반 수익 누락. 단 10-17 이후 상태 전이 0건이라 실손 = 0 — `store_order_events` 2026-10-17 18:00 이후 0행)
- **현행 동작**: 상태 UPDATE 시 부과·검토 없음. 진행 중 주문(예: `SO1790254620754fa9f` ready_for_pickup, 의무 없음)이 완료되어도 부과 없음.
- **기대 동작**: 조리 이후 상태 첫 진입 시 같은 트랜잭션에서 1회 부과. 실패하면 상태 변경 롤백.
- **수정 설계**: (1) Owner 승인 후 `ALTER TABLE public.store_orders ENABLE TRIGGER trg_store_orders_commission_lifecycle;` (2) 활성화 전 SSOT §12-4(진행 중 주문 다음 전이 부과) 결정을 확정. (3) `store_commission_integrity_report` 에 I7 추가 — `order_status IN (preparing…completed) AND updated_at >= go_live AND NOT EXISTS obligation`, 그리고 `pg_trigger.tgenabled <> 'O'` 검사 → `store_commission_enqueue_exception_notifications` 에서 critical 알림. (4) `scripts/verify-schema-authority.mjs` 기대값에 `enabled='O'` 고정.
- **연동 영향**: 활성화 즉시 정책 없는 매장은 조리 진입 거부(현재 0곳). 캐시 0 매장 16곳은 미납이 쌓임(게이트 OFF 이므로 주문은 계속).
- **검증 방법**: 활성화 후 `pg_trigger` 재조회 → `O`; 다음 조리 진입 주문 1건의 `store_sale_fee_obligations` 1행·`SALE_FEE` 원장 확인; I7 = 0.
- **Owner 승인 필요**: 운영 DB 트리거 활성화(DB 변경), 진행 중 주문 부과 정책.
- **증명 상태**: 비활성 = 운영 SQL 증명. 실손 금액 = 0(증명). 비활성화 주체·이유 = NOT_PROVEN.

### FIN-02 · 미납 상계 멱등 키 충돌 → 충전 승인·Coin 전환 실패
- **영역**: DB 함수 `settle_store_sale_fee_obligations`
- **증상**: 같은 의무에 같은 금액으로 두 번째 부분 상계가 일어나면 원장 UNIQUE 위반으로 전체 트랜잭션이 롤백된다.
- **원인**: 운영 정의 `idempotency_key = 'sale_fee_settle:' || v_ob.id || ':' || v_pay` (저장소 `20261202120000_currency_cut_d_sale_fee_obligation.sql:240`) + `business_cash_ledger_idem_uidx UNIQUE(idempotency_key)`. 예: 미납 ₱100 의무에 ₱20 충전 승인 → 키 `…:2000`; 다시 ₱20 충전 승인 → 같은 키 → `unique_violation` → `approve_business_cash_charge_request` 전체 롤백(잔액·원장·요청 상태 모두 원복). 같은 상계 호출이 `convert_store_economic_points_to_business_cash`(`20270421120200…:320,474`)에도 있다.
- **영향**: 매장 — 소액 분할 충전이 계속 실패하여 미납 매장이 충전할 수 없음 → 게이트 ON 시 주문 영구 차단. 관리자 — 승인 실패 원인 불명(`rpc_failed`).
- **심각도**: **P1**
- **현행 동작**: 두 번째 같은 금액 부분 상계에서 승인/전환 거부.
- **기대 동작**: 부분 상계는 매번 고유 키로 기록.
- **수정 설계**: 키를 `'sale_fee_settle:' || v_ob.id || ':' || v_ob.fee_paid_minor || ':' || v_pay`(상계 직전 누적 납부액 포함 — 단조 증가라 유일)로 변경. 기존 행은 변경 없음.
- **연동 영향**: 무결성 I2(납부액 = SALE_FEE + SETTLEMENT − REVERSAL)는 키와 무관. 상계 조회 화면 영향 없음.
- **검증 방법**: 롤백 트랜잭션 시나리오(미납 10,000 / 충전 2,000 × 2회) → 2회 모두 성공, SETTLEMENT 원장 2행.
- **Owner 승인 필요**: 운영 함수 교체(DB).
- **증명 상태**: 정적 증명(운영 함수 정의 + UNIQUE 제약). 실제 재현 = NOT_PROVEN(쓰기 금지).

### FIN-03 · 플랫폼 보유분(상품권·플랫폼 쿠폰) 지급 경로 모순
- **영역**: Coin 적립 / gift rail / 지급 의무 분류
- **증상**: 같은 상품권 금액을 세 군데가 서로 다르게 취급한다.
  1) Coin 적립은 상품권 **총액**(수수료 10% 차감 전)을 민팅: `platformHeldSaleAmountPhp = gift_redemption_amount + platform_funded_amount` (`lib/currency/recognize-order-currency-on-completed.ts:36-42`), env `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 로만 켜짐(`lib/currency/currency-cutover-flags.ts:18-21`).
  2) gift rail 은 **순액**(merchant_net, 90%)을 REVENUE_AVAILABLE 로 기록하고 "coin_mint: deferred_to_sale_coin" 반환(운영 `gift_certificate_recognize_revenue_for_completed_order`) — 그러나 gift 현금화·전환 API 는 410(`app/api/me/stores/[storeId]/gift-certificates/cash-outs|conversions/route.ts`, `app/api/admin/gift-certificates/conversions/[id]/approve/route.ts:21-29`).
  3) `store_platform_payable_page` 는 상품권 금액을 `gift_rail`("상품권 정산 레일에서 지급, 여기서 지급 안 함")로 분류해 지급 의무에서 제외(`store-commission-contract.ts:101-106`).
- **원인**: 위 3개 작성자가 서로 다른 SSOT 를 가정. 운영: 9월 완료 3건(`SO1789099652781eb6d` 등)이 gift 매출 900 + Coin 2,000(결제액 포함 구 방식)을 동시에 받음. gift rail 잔여 available = store `19085860…` 10,700. 플랫폼 쿠폰 payable ₱40(1건)은 지급 수단 없음.
- **영향**: 금전 — 플래그 ON: 상품권 수수료 10% 를 매장에 되돌려 주고, gift rail 잔액은 화면상 "지급 예정"으로 남아 이중 지급 위험. 플래그 OFF: 상품권·플랫폼 쿠폰 금액을 매장에 줄 경로가 없음(미지급).
- **심각도**: **P1**
- **현행 동작**: 플래그 값 NOT_PROVEN(마지막 SALE_EARN 2026-09-15).
- **기대 동작**: 플랫폼 보유분 지급 레일 1개, 금액 = 상품권 순액 + 플랫폼 쿠폰.
- **수정 설계**: Owner 결정(SSOT §12-8)에 따라 (A) Coin 단일: 민팅액 = Σ gift `merchant_net_amount` + `platform_funded_amount`, 민팅 시 gift ledger 에 `CONVERTED_TO_COIN` 소진 행 기록, payable 함수의 gift_rail 분류를 "Coin 지급분"으로 변경 / (B) gift rail 단일: Coin 민팅에서 gift 제외, gift 현금화 RPC 재개. 어느 쪽이든 `store_platform_payable_page` 항등식 수정.
- **연동 영향**: Coin 역분개(`reverse_coin_credits_for_order`) 금액, 재무 대시보드, 상품권 운영 화면.
- **검증 방법**: 상품권 1,000 사용 주문 완료 → 매장 수령 합계 = 900(한 레일만) 확인; payable 요약 항등식.
- **Owner 승인 필요**: 지급 레일 선택, env 플래그 값 확인.
- **증명 상태**: 코드·운영 데이터 증명. 플래그 현재 값 NOT_PROVEN(Vercel env 미조회).

### FIN-04 · 캐시 충전이 입금 증빙 없이 적립 + 재시도 중복 요청
- **영역**: 캐시 충전 요청·승인
- **증상**: 오너는 금액만 입력하고, 관리자는 입금 확인 근거 없이 승인하면 즉시 캐시가 적립된다. 클라이언트 멱등 키에 `Date.now()` 가 들어가 네트워크 재시도·재클릭마다 새 요청이 생긴다.
- **원인**: `business_cash_charge_requests` 컬럼에 입금 참조번호·증빙·결제 수단 없음(운영 컬럼 조회). 키 생성 `bc_topup:${storeId}:${php}:${Date.now()}` (`components/business/owner/OwnerBusinessCashView.tsx:185`), 서버 대체 키도 `Date.now()` (`app/api/me/stores/[storeId]/business-cash/route.ts:144-146`). 승인 RPC 는 `service_role` 만 확인하고 관리자 신원·권한은 재확인하지 않음(운영 `approve_business_cash_charge_request` 정의) — 결정 함수(`admin_decide…`)는 `is_platform_admin` 재확인과 대조. 라우트 권한은 `business`(super_admin 아님, `app/api/admin/business-cash-charges/route.ts:112`). 매장 소유 관리자가 자기 매장 충전을 승인하는 것을 막는 검사 없음. 승인 사유는 감사 로그에만 있고 요청 행에는 없음. 최대 금액 제한 없음(`amount_minor > 0` CHECK 만).
- **영향**: 금전(플랫폼) — 중복 PENDING 2건을 모두 승인하거나 입금 없이 승인하면 캐시가 무상 적립되어 수수료·광고비로 소진. 관리자 — 대사 근거 없음.
- **심각도**: **P1**
- **현행 동작**: 승인 20건 ₱17,878 — 입금 대사 근거 NOT_PROVEN.
- **기대 동작**: 입금 참조(GCash 참조번호/이체 영수증) 필수, 같은 매장 PENDING 중복 경고, 승인 시 참조 일치 확인, 금액 상한, 자기 매장 승인 금지.
- **수정 설계**: 요청 테이블에 `payment_method`, `payment_reference`(매장 내 UNIQUE), `proof_file_path`, `approve_reason` 추가 → RPC `owner_create_business_cash_charge_request`(PENDING 동시 1건 제한) · 승인 RPC 에 `is_platform_admin(p_admin_user_id)` + `stores.owner_user_id <> p_admin_user_id` 검사 + 사유 컬럼 저장. 클라이언트 키는 폼 열 때 1회 생성(`crypto.randomUUID()`)해 재시도에 재사용.
- **연동 영향**: CD-2 HARD LOCK(`dibay-owner-cash-charge-notify-wire-hard-lock.md`) 알림 경로는 유지(라우트 내부만 보강).
- **검증 방법**: 같은 폼 2회 전송 → 요청 1건; 참조 없는 승인 거부; 자기 매장 승인 거부.
- **Owner 승인 필요**: 충전 입금 방식(플랫폼 계좌/GCash) 정책, 금액 상한, DB 변경.
- **증명 상태**: 코드·스키마 증명. 실제 중복 승인 사례 = NOT_PROVEN.

### FIN-05 · 환불 시 Coin 역분개가 상태 트랜잭션 밖 · 실패는 로그만
- **영역**: 환불 / Coin
- **원인**: `refunded` CAS 커밋 후 `reverseCoinCreditsForOrder` 를 별도 호출하고 실패 시 `console.error` 만(`lib/stores/apply-store-order-status-transition.ts:424-430`). 보정 크론은 보고 전용 — `RECONCILE_WRITE_MODE_APPROVED = false`(`lib/currency/reconcile-order-currency.ts:33`).
- **영향**: 금전 — 환불 주문의 Coin(상품권·플랫폼 쿠폰분)이 회수되지 않고 출금 가능 상태로 남을 수 있음.
- **심각도**: **P2** (Coin 민팅 자체가 플래그 의존)
- **현행 동작**: 실패 시 주문은 `refunded`, Coin 유지.
- **기대 동작**: 역분개가 환불 트랜잭션과 원자적.
- **수정 설계**: `gift_certificate_refund_order_atomic` 안에서 `reverse_coin_credits_for_order(p_order_id, 'coin_reversal:order:'||id, 'order_refund')` 를 호출(이미 같은 DB 트랜잭션, 멱등 키 동일) 하고 TS 호출은 제거, 또는 FIN-01 트리거의 refunded 분기에 추가.
- **검증 방법**: Coin 민팅된 주문 환불 → REVERSAL 1행이 같은 트랜잭션에 생성, 함수 오류 시 상태도 롤백.
- **Owner 승인 필요**: DB 함수 변경.
- **증명 상태**: 코드 증명. 실제 누락 건 = 운영 reconcile 보고 미조회로 NOT_PROVEN.

### FIN-06 · TS 가 레거시 `store_settlements` 의 수수료·상태를 계속 수정 (SSOT 위반)
- **영역**: 레거시 정산 스냅샷
- **원인**: 환불 시 `adjustStoreSettlementOnRefund` 가 `commission_reversal_amount`(수수료 환급액)·`net_settlement_amount`·`settlement_status`(paid→held, 0원→cancelled)를 TS 에서 계산·기록(`lib/stores/adjust-store-settlement-on-refund.ts:92-139`), 취소 시 `cancelScheduledSettlementForOrder` 가 scheduled→cancelled(`lib/stores/cancel-store-settlement.ts:12-15`). 호출: `apply-store-order-status-transition.ts:419-423,445`. 생성 writer 는 꺼져 있음(`ensure-store-settlement.ts:18,42`).
- **문서와 차이**: SSOT §0-2 A "원본 `store_settlements` 는 읽기만 하고 변경하지 않는다", AGENTS.md "TS 에서 수수료 금액을 쓰거나 되돌리지 않는다".
- **영향**: 관리자 — "수수료 환급" 숫자가 두 곳(레거시 스냅샷 vs `store_commission_adjustments`)에 다르게 생김. 돈은 움직이지 않음.
- **심각도**: **P2**
- **수정 설계**: 두 호출 제거(또는 `LEGACY_STORE_SETTLEMENT_WRITER_ENABLED` 가드 적용). 레거시 표시는 읽기 전용 유지.
- **검증 방법**: 환불 후 `store_settlements` 행 무변경 단위 테스트.
- **Owner 승인 필요**: 없음(코드).
- **증명 상태**: 코드 증명.

### FIN-07 · 관리자 일별·매장 재무제표·수수료 정책 개요가 레거시 스냅샷을 수치 원천으로 사용
- **영역**: 관리자 재무 조회
- **원인**: 일별 재무제표 주문 수·매출·`feeDue` = `loadStoreSettlementFinancialFacts`(store_settlements) (`lib/finance/daily-statement/load-daily-statement.ts:59-73`); 매장 재무제표도 동일(`lib/admin/store-financial-statement/load-store-financial-statement.ts:176-185`); 수수료 정책 개요의 "최근 적용 수수료"도 store_settlements(`app/api/admin/store-fee-policies/overview/route.ts:305-311`); 재무 관제 `SETTLEMENT_REFUND`(`lib/admin/finance-control-plane/load-finance-control-plane.ts:567-588`). 레거시 writer 는 2026-09-15 이후 정지 → 운영 완료 주문 10건이 이미 스냅샷 없음. 레거시 API `/api/me/store-settlements`(payout 필드 포함)·`/api/admin/store-settlements` GET 은 UI 소비자 없이 살아 있음(`MyStoreSettlementsPage` import 0).
- **영향**: 관리자 — 신규 주문이 재무제표에서 빠지고, 수수료 금액이 실제 부과(obligation)와 다르게 표시.
- **심각도**: **P2**
- **수정 설계**: 주문·매출 = `store_orders`(완료, Manila 일자) + 수수료 = `store_commission_breakdown`(같은 SQL), 정책 개요 = `store_sale_fee_obligations.fee_snapshot`. 레거시 API 2개는 410 또는 삭제.
- **검증 방법**: 같은 매장·기간에서 재무제표 수수료 합 = `/admin/store-settlements` 원장 합.
- **Owner 승인 필요**: 없음(코드).
- **증명 상태**: 코드 + 운영 집계(10건) 증명.

### FIN-08 · Cash/Coin 관리자 정정 경로 없음 — ₱225 불일치 상시 위반
- **영역**: 관리자 수동 조정
- **원인**: `business_cash_ledger.entry_kind` CHECK 에 `ADMIN_ADJUST` 가 있으나 작성 함수·API 없음(grep 결과 마이그레이션 4개 정의에만 등장, TS 0). Coin `ADMIN_ADJUST` 도 동일. 레거시 조정 API 는 410(`app/api/admin/store-points/[storeId]/adjust/route.ts`).
- **운영 증거**: `store_commission_integrity_report(null)` → `balance_eq_ledger_sum.violations = 1`(store `19085860…`), 코인 초과 9,050(payable 요약).
- **영향**: 관리자 — 증거 기반 정정·회수 수단이 없어 예외 알림이 영구 잔존.
- **심각도**: **P2**
- **수정 설계**: `admin_adjust_business_cash(p_admin, p_store, p_direction, p_amount_minor, p_reason, p_evidence_ref, p_idem)` · `admin_adjust_store_coin(...)` — super_admin, 사유 필수, 원장 1행 + `audit_logs`, 잔액 CHECK 유지. 정정 원장 전용(잔액 이동 0) 모드 포함(SSOT §0-4-1 제안 SQL).
- **Owner 승인 필요**: 정정 정책(§7), DB 함수 추가.
- **증명 상태**: 운영 SQL 증명.

### FIN-09 · Coin·출금·상품권 매출 원장 테이블에 쓰기·TRUNCATE 권한 잔존
- **영역**: DB 권한
- **원인**: 운영 `role_table_grants`: `store_economic_point_accounts`, `store_economic_point_ledger`, `coin_withdrawal_requests`, `gift_certificate_revenue_ledger`, `business_cash_charge_requests`, `business_cash_conversion_rate_policies`, `store_settlements` 에 anon/authenticated/service_role 의 INSERT·UPDATE·DELETE·TRUNCATE. RLS 는 켜져 있고 쓰기 정책은 없음(클라이언트 DML 차단). Cash 원장·계정·의무는 F-02/F7 에서 회수 완료 — Coin 쪽만 누락. service_role 은 RLS 우회라 서버 코드 한 줄로 Coin 잔액·출금 상태(PAID)를 RPC 없이 바꿀 수 있고, TRUNCATE 는 행 트리거(불변 트리거)를 우회한다.
- **영향**: 현재 TS 직접 쓰기 0건(grep) → 실악용 증거 없음. 방어 심층 결함.
- **심각도**: **P2**
- **수정 설계**: Cash 와 같은 REVOKE(INSERT/UPDATE/DELETE/TRUNCATE FROM anon, authenticated, service_role) + 필요한 SELECT 만 GRANT. 오너 충전 요청 INSERT 는 RPC 로 이전(FIN-04).
- **검증 방법**: 권한 재조회, 기존 RPC 회귀.
- **Owner 승인 필요**: DB 권한 변경.
- **증명 상태**: 운영 SQL 증명.

### FIN-10 · 운영 배포 상태 추적 불가 (마이그레이션 기록 누락 · 문서 상태 불일치)
- **영역**: 운영
- **원인**: 운영 `schema_migrations` 최대 `20270520120000`, `20270421120*`·`20270510120000`·`20270512120000`·`20270515*`·`20270523*`·`20270601*` 미기록인데 해당 함수 존재(SQL 확인). SSOT 문서 머리말은 "운영 DB 미적용"(`docs/store-commission-cash-settlement-ssot.md:10`) — 실제로는 적용됨, 그리고 트리거만 비활성(FIN-01).
- **영향**: 관리자·개발 — 다음 마이그레이션 적용 시 재실행/누락 판단 불가, 트리거 비활성 같은 드리프트가 검출되지 않음.
- **심각도**: **P2**
- **수정 설계**: 적용된 버전을 `schema_migrations` 에 기록(Owner 승인), `verify-schema-authority` 에 함수·트리거 enabled 비교 포함, SSOT 문서 상태 갱신.
- **Owner 승인 필요**: 운영 메타 테이블 기록.
- **증명 상태**: 운영 SQL 증명.

### FIN-11 · 오너 재무 화면의 미납 합계가 SQL 단일 함수가 아닌 TS 집계
- **원인**: `/api/me/stores/[storeId]/finance` 미납 = `aggregateOpenSaleFeeObligations`(TS) (`app/api/me/stores/[storeId]/finance/route.ts:59-79`), 정산 화면은 `store_cash_position`(SQL). AGENTS "Admin·Owner 는 같은 SQL 조회 함수만" 과 차이.
- **영향**: 같은 테이블이라 현재 숫자 차이는 없으나 SSOT 이원화.
- **심각도**: **P3** · 수정: `store_cash_position` 호출로 교체 · 증명: 코드.

### FIN-12 · 수수료 환급 승인으로 캐시가 늘어도 다른 미납을 상계하지 않음
- **원인**: `admin_decide_store_commission_adjustment` 는 캐시 환급 후 `settle_store_sale_fee_obligations` 미호출(마이그레이션 §6). 잔액 > 0 과 미납 > 0 이 동시에 표시됨. 순잔액·게이트는 정상.
- **심각도**: **P3** · 수정: 결정 함수 끝에서 상계 호출(충전·전환과 동일 규칙) · 증명: 코드.

### FIN-13 · 수수료 기준액에 배달비·상품권(이미 10% 수수료) 포함 — 문서에 미기재
- **원인**: 기준액 = `payment_amount + gift_redemption_amount + platform_funded_amount`(SQL `store_commission_charge_order_internal`), 운영 데이터상 `payment_amount` 는 배달비 포함(배달비 있는 주문 19/19). 상품권 사용분은 gift 수수료 10% + 판매 수수료 7% = 17%.
- **심각도**: **P3**(정책 명시 누락) · 결정은 §7.

### FIN-14 · 승인 취소·정지 매장도 충전·전환·Coin 출금 요청 가능
- **원인**: `getStoreIfOwner` 는 소유만 확인(`lib/stores/owner-product-gate.ts:12-37`), `coin_withdrawal_request` 도 소유만 확인.
- **심각도**: **P3**(정책) · 수정: 정지 매장 출금 보류 정책 결정 후 검사 추가.

### FIN-15 · 주문 생성 차단 게이트 이원화
- **원인**: 레거시 `stores.point_commerce_blocked` 검사가 `create_store_order_atomic` 에 남아 있음(운영 정의 확인) + 신규 캐시 게이트 트리거. 레거시 플래그 작성 경로 없음, 현재 true 0곳.
- **심각도**: **P3** · 수정: 레거시 검사 제거 또는 캐시 게이트로 일원화.

---

## 4. 누락 기능 (설계 제안 — 결함 아님)

| # | 기능 (배민·요기요·쿠팡이츠 사장님 기준) | 현재 | 제안 |
|---|---|---|---|
| M1 | 정산·수수료 명세 CSV/엑셀·월별 명세서 | 없음(`text/csv` 응답 0) | `store_commission_ledger_page`/`store_cash_ledger_page` 동일 함수 기반 CSV, Manila 월 마감 |
| M2 | 수수료 세금계산서/영수증(BIR OR) | 없음 | 월별 SALE_FEE 합계 기준 영수증 발행 레코드 |
| M3 | 출금 계좌 등록·변경 승인 | 출금 건마다 계좌 입력 | `store_payout_accounts`(검증 상태, 변경 시 관리자 승인·쿨다운) |
| M4 | 플랫폼 지급 의무(payable) 지급 처리 | 분류만 있음, 지급 CTA·레일 없음(DEF-29) | FIN-03 결정 후 단일 레일 |
| M5 | 캐시 충전 입금 안내·자동 대사 | 금액 입력만 | 플랫폼 수취 계좌 표시 + 참조번호 대사 |
| M6 | 미납 매장 개별 면제·분할 납부 | 없음 | 관리자 결정 원장 재사용(`store_commission_adjustments` 패턴) |
| M7 | 광고비·수수료 통합 월 정산서(주문별 광고 귀속) | `delivery_ad_order_attributions` 존재, 주문 매트릭스 미연결 | 주문 상세 금전 체인에 광고 귀속 표시 |
| M8 | 부분 취소·부분 환불 | 제품 잠금 `partialRefundSupported:false` | 정책 결정 시 수수료 부분 승인과 연동 |

---

## 5. SSOT 표

| 데이터 | 권위 원천 | 이탈 소비자 |
|---|---|---|
| 수수료 부과액 | `store_sale_fee_obligations` (트리거 → `store_commission_charge_order_internal`) | 일별·매장 재무제표 `feeDue`(store_settlements, FIN-07) · 정책 개요 최근 적용(FIN-07) · `/api/me/store-settlements`(FIN-07) |
| 수수료 환급 | `store_commission_adjustments` (`admin_decide_store_commission_adjustment`) | `adjustStoreSettlementOnRefund` 가 `store_settlements.commission_reversal_amount` 기록(FIN-06) |
| 캐시 잔액 | `business_cash_accounts` + `business_cash_ledger` | store `19085860…` 불일치 1(FIN-08) |
| 미납·순잔액·주문 가능 | `store_cash_position` | 오너 재무 화면 TS 집계(FIN-11) |
| Coin 잔액 | `store_economic_point_accounts` + 원장 | — (일치) |
| 플랫폼 보유분 지급 | `store_platform_payable_page` (분류) | Coin 민팅 gross(FIN-03) · gift rail net(FIN-03) |
| 고객 결제액 | `store_orders.payment_amount` (배달비 포함) | — |
| 수수료 정책 | `store_fee_policies` (`store_commission_resolve_policy`) | `commerce-settings` `store_settlement_fee_bp`(레거시, 화면에서 레거시 표시) |
| 기간 경계 | Asia/Manila (서버 계산) | 일별 재무제표 `completed_at || settlement_created_at` 기준(FIN-07) |
| 주문 차단 | `store_cash_order_gate` + 트리거 | `point_commerce_blocked`(FIN-15) |

### 주문별 금전 매트릭스

| 항목 | 보관 위치 (테이블.컬럼) | 상태 |
|---|---|---|
| 주문 금액(상품+옵션+배달비) | `store_orders.total_amount` | 있음 |
| 할인(합계) | `store_orders.discount_amount` | 있음 |
| 할인 부담 — 매장 | `store_orders.store_funded_amount` | 있음 |
| 할인 부담 — 플랫폼 | `store_orders.platform_funded_amount` | 있음 (지급 레일 없음 FIN-03) |
| 상품권 사용액 / 상품권 수수료 / 매장 순액 | `store_orders.gift_redemption_amount` / `gift_certificate_redemptions.platform_fee_amount` / `.merchant_net_amount` | 있음 |
| 고객 결제액(매장 직접 수령) | `store_orders.payment_amount` + `buyer_payment_method` | 있음 (플랫폼 결제 기록 `store_payments` 테이블 없음 — 직접 결제라 정상) |
| 배달비(고객 부담 → 매장 수령) | `store_orders.delivery_fee_amount` (payment_amount 에 포함) | 있음 · 라이더 지급액 컬럼 **없음** |
| 수수료 기준액 | `store_sale_fee_obligations.confirmed_revenue_php` + `fee_snapshot.commission_base_php` (`store_orders.commission_base_amount` 는 레거시, 49건 불일치) | 있음(이원) |
| 수수료 부과/납부/미납 | `store_sale_fee_obligations.fee_due/paid/outstanding_minor`, `original_fee_due_minor` | 있음 (트리거 비활성 FIN-01) |
| 수수료 캐시 차감 | `business_cash_ledger` SALE_FEE / SALE_FEE_SETTLEMENT | 있음 |
| 수수료 환급 결정 | `store_commission_adjustments` + 원장 SALE_FEE_REVERSAL | 있음 |
| 광고비 | `business_cash_ledger` AD_SPEND (캠페인 단위), `delivery_ad_order_attributions` | 주문 단위 연결 **없음** |
| Coin 적립 / 역분개 | `store_economic_point_ledger` `sale_coin:{order}` / `coin_reversal:order:{order}` | 있음 (gross 문제 FIN-03, 비원자 FIN-05) |
| Cash 사용(주문 연관) | SALE_FEE 계열만 | 있음 |
| 상품권 매출 | `gift_certificate_revenue_ledger` | 있음 (지급 경로 없음 FIN-03) |
| 고객 환불 | `store_orders.order_status`/`payment_status`/`refunded_at`; 금액 컬럼 **없음**(전액 환불만) | 금액 필드 없음 |
| 매장 정산(지급) | 개념 없음. 레거시 `store_settlements`(scheduled 501 / ₱3,119,420 = 지급 의무 아님) | 레거시 잔존 |
| 플랫폼 원장(플랫폼 수익) | 별도 플랫폼 원장 테이블 **없음** — 수수료 수익 = obligations 합, 상품권 수수료 = redemptions 합 | 통합 플랫폼 원장 없음 |

---

## 6. 기존 문서와 구현 차이

| 문서 | 문서 내용 | 구현/운영 실제 |
|---|---|---|
| `store-commission-cash-settlement-ssot.md:10` | "운영 DB 미적용 · 운영 배포 전" | 운영에 함수·테이블·게이트 설정 존재(10-17 18:23), **수수료 트리거만 비활성**(FIN-01, FIN-10) |
| 같은 문서 §0-2 A | 원본 `store_settlements` 는 읽기만 | 환불·취소 시 TS 가 수정(FIN-06) |
| 같은 문서 §9-A 표 | 정산표 '지급 예정' 501건 | 운영 동일(501 / ₱3,119,420) — 일치 |
| 같은 문서 §0-1 A | 플랫폼 보유분 중 상품권은 gift rail 에서 "이미 매장 몫으로 기록·지급" | gift 현금화·전환 API 410 → **지급 경로 없음**(FIN-03) |
| `dibay-currency-ssot-hard-lock.md` §2 CASH | Sale fee = 트리거 `trg_store_orders_commission_lifecycle` | 트리거 비활성(FIN-01) |
| 같은 문서 §2 COIN | Inflow = platform-held sale (gift + coupon) via sale_coin | 금액이 gift gross — gift rail(net)과 불일치(FIN-03) |
| `app/api/admin/store-settlements/[settlementId]/route.ts:10-12` 주석 | 플랫폼 보유분은 "완료 시 Coin 으로 자동 지급" | env 플래그 의존, 현재 값 NOT_PROVEN |
| `dibay-admin-delivery-ops-audit-design.md` DEF-1/2/3 | 수수료 정책 권한·감사·비원자 | **해소 확인**: super_admin(`store-fee-policies/route.ts:255`, `[id]/route.ts:162,396`), 감사 `auditAdminFeePolicyWrite`, 원자 RPC `admin_supersede_store_fee_policy` 운영 배포 |
| 같은 문서 DEF-4 | 레거시 scheduled writer 동작 중 | 생성 writer 정지 확인(`ensure-store-settlement.ts:18`) — 단 수정 writer 잔존(FIN-06) |
| 같은 문서 DEF-10 | 캐시 충전 승인·코인 출금 감사 없음 | **해소 확인**: 사유 필수 + 감사(`business-cash-charges/route.ts:128-149`, `coin-withdrawals/route.ts:90-140`) |
| 같은 문서 DEF-30 | 충전 반려 사유 하드코딩 | 서버가 사유 2자 이상 강제(`business-cash-charges/route.ts:173-176`) — UI 측 NOT_PROVEN |
| `dibay-delivery-ads-finance-approval-authority-design.md` | Store Points/Business Cash 설계 | SUPERSEDED 명시 — 현행 권위 아님(일치) |
| `store-order-cancel-refund-decision-ssot.md` §3 | 조리 이후 취소·환불 → 트리거가 검토 대기 | 트리거 비활성으로 미동작(FIN-01) |

---

## 7. Owner 정책 결정 필요 사항

1. **FIN-01 트리거 활성화 시점**과 진행 중 주문(조리 이후인데 의무 없음, 운영 최근 갱신 4건 포함)의 처리: 다음 전이 1회 부과(현 설계) / 활성화 시점 이전 주문 제외.
2. **플랫폼 보유분 지급 레일 단일화**(FIN-03): Coin(순액 기준으로 수정) vs gift rail(현금화 재개). 플랫폼 쿠폰 ₱40 지급 방법 포함. `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 현재 값 확인.
3. **수수료 기준액 범위**(FIN-13): 배달비 포함 여부, 상품권 사용분에 판매 수수료 7% 추가 부과(총 17%) 유지 여부.
4. **캐시 충전 입금 방식**(FIN-04): 플랫폼 수취 계좌/GCash, 참조번호 필수, 1회·월 상한, 승인 권한 등급(business vs super_admin).
5. **정정 정책**(FIN-08): ₱225 원장 정정(SSOT §0-4-1 제안 SQL), Coin 초과 9,050(그중 출처 불명 5,820) 회수 여부.
6. **차단 게이트 ON 시점**: 현재 ON 시 17곳 중 16곳 즉시 신규 주문 차단.
7. **레거시 잔액 처리**: `stores.point_balance` 14곳 합 77,217,484(구 AST-002) — 부채인지 소멸인지 공지 필요.
8. **정지 매장 출금·전환 허용 여부**(FIN-14).
9. **레거시 `store_settlements` 501건**: 보존만(현행) / 분류 컬럼 추가(SSOT §9-B).
10. **운영 메타 정합**(FIN-10): 적용된 마이그레이션 버전 기록 승인.
