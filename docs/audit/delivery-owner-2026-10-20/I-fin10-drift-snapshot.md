# I · FIN-10 운영 함수 드리프트 스냅샷 (2026-10-20 PHT)

- 대상: 운영 `ckdosyydvgzqwpbwuhon` · 읽기 전용 `SELECT` 만 (쓰기·마이그레이션 적용·`schema_migrations` INSERT 없음).
- 설계: `G-1-stage1-2-design.md` §5-0 FIN-10 ① 스냅샷 / ③ 해시 비교.
- 방법: 운영 `md5(pg_proc.prosrc)` ↔ 저장소 `supabase/migrations` 파일명 정렬상 **마지막** `create [or replace] function public.<name>(` 의 달러 인용 태그 사이 원문 md5.
- 원본 해시: [`fin10-prod-function-md5.json`](./fin10-prod-function-md5.json) · 재검증: `npm run verify:prod-function-drift` (오프라인, 기본 report-only · `--strict` 시 드리프트면 exit 1).

## 1. 결과 요약

**23/23 MATCH · DRIFT 0.** 모든 함수 운영 1개 오버로드, owner `postgres`, `SECURITY DEFINER`(prosecdef=true).
→ 2단계 함수 교체는 **저장소 최신 정의 = 운영 원문** 기준으로 작성해도 회귀 위험 없음(스냅샷 시점 기준). DRIFT 가 없어 `pg_get_functiondef` diff 는 불필요했다.

| 함수 | 시그니처 | prod md5 | repo 최신 파일 | 결과 |
|---|---|---|---|---|
| settle_store_sale_fee_obligations | (p_store_id uuid) | e600e0e0256a091371f1da793e067645 | 20261202120000_currency_cut_d_sale_fee_obligation.sql | MATCH |
| approve_business_cash_charge_request | (p_admin_user_id uuid, p_request_id uuid) | 49aa771941ccc7e3ba56858ee52e6cf3 | 20270118120000_finance_f02_cash_balance_writer_lock.sql | MATCH |
| convert_store_economic_points_to_business_cash | (p_owner_user_id, p_store_id, p_points int, p_expected_rate_version int, p_idempotency_key) | df210f1dc578354ce78d22184982f1aa | 20270421120200_finance_ssot19_d2_coin_settlement.sql | MATCH |
| admin_decide_store_commission_adjustment | (p_admin_user_id, p_order_id, p_decision, p_approved_minor bigint, p_reason, p_idempotency_key) | 731ad5fe62d7ae8589186ae76c71254a | 20270510120000_store_commission_cash_ssot.sql | MATCH |
| gift_certificate_refund_order_atomic | (p_order_id, p_actor_user_id) | cb3267c206e2da28ee69aa5a3d31bef5 | 20270101150000_gift_refund_order_atomic_from_status_cas.sql | MATCH |
| gift_certificate_cancel_order_restore | (p_order_id) | d3b8126d739a4161edeafaf57f41cc49 | 20270101130000_gift_certificate_cancel_order_restore.sql | MATCH |
| gift_certificate_redemption_reverse | (p_order_id) | da8e00cd131551f5454712b7571513df | 20270421120300_finance_ssot19_d2_gift.sql | MATCH |
| restore_store_coupon_entitlement | (p_order_id, p_allow_after_completed bool) | ac77b283ccb6e199e1622968948446d5 | 20260825120000_free_coupon_ssot_m1_m6.sql | MATCH |
| create_store_order_atomic | (p_buyer_user_id, p_store_id, p_client_order_key, p_order jsonb, p_lines jsonb) | 1749beecbda87eb2596ad1e8f886cf78 | 20270602130000_store_products_review_lock_stock_reason.sql | MATCH |
| gift_certificate_purchase | (p_buyer_user_id, p_product_id, p_idempotency_key) | 416cfd27e0a645eb6e211567af58144c | 20261129230000_gift_certificate_purchase_mall_visible_gate.sql | MATCH |
| reverse_coin_credits_for_order | (p_order_id, p_idempotency_key, p_reason) | d4b9c896ff27db5dd4ed87bcbe56690f | 20261202100000_currency_cut_b_coin_reversal.sql | MATCH |
| credit_coin_from_confirmed_sale (Coin 발행) | (p_store_id, p_order_id, p_settlement_id, p_amount int, p_idempotency_key) | 49773271f36eda0227f9a3e2231fbc5b | 20270421120200_finance_ssot19_d2_coin_settlement.sql | MATCH |
| credit_coin_from_gift_revenue | (p_store_id, p_redemption_id, p_amount int, p_idempotency_key) | b41e41676c56520bdab8cd6c65cd852a | 20261202110000_currency_cut_c_sale_coin_ssot.sql | MATCH |
| credit_coin_from_settlement | (p_store_id, p_settlement_id, p_order_id, p_amount int, p_idempotency_key) | 47e7cd77dad909ef21b720b6782825c7 | 20261202000000_currency_coin_ssot_cut2.sql | MATCH |
| store_commission_charge_order_internal | (p_order_id, p_stage) | 725433cd1d67818de7e220dd96ca07e1 | 20270510120000_store_commission_cash_ssot.sql | MATCH |
| store_platform_payable_page (sql) | (p_store_ids uuid[], p_from, p_to, p_view, p_limit, p_offset) | 47b54ef1d02ff73bf472726208f4aabb | 20270510120000_store_commission_cash_ssot.sql | MATCH |
| store_commission_integrity_report (sql) | (p_store_ids uuid[]) | b7871c44f74347ddd6d9e26fb1115270 | 20270510120000_store_commission_cash_ssot.sql | MATCH |

### 트리거 함수 + `tgenabled`

| 트리거 (테이블.이름) | 함수 | tgenabled | repo 최신 파일 | 결과 |
|---|---|---|---|---|
| store_orders.trg_store_orders_commission_lifecycle | store_orders_commission_lifecycle | O | 20270602100100_store_commission_trigger_reenable_no_backcharge.sql | MATCH |
| store_orders.trg_store_orders_cash_order_gate | store_orders_enforce_cash_order_gate | O | 20270510120000_store_commission_cash_ssot.sql | MATCH |
| store_orders.trg_store_orders_gift_revenue_recognition | trg_store_orders_gift_revenue_on_completed | O | 20261128140000_gift_certificate_order_completion_revenue.sql | MATCH |
| store_commission_adjustments.store_commission_adjustments_no_mutation | store_commission_adjustments_immutable | O | 20270510120000_store_commission_cash_ssot.sql | MATCH |
| store_settlements.trg_store_settlements_block_paid_when_coin_recognized | store_settlements_block_paid_when_coin_recognized | O | 20270421120000_finance_ssot19_d1_member_write_lock.sql | MATCH |
| business_cash_ledger.business_cash_ledger_no_update | business_cash_ledger_forbid_mutate | O | 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql | MATCH |

그 외 관련 테이블의 `block_client_role_direct_writes`(business_cash_charge_requests · business_cash_conversion_rate_policies · coin_withdrawal_requests · gift_certificate_revenue_ledger · store_settlements) · `delivery_ad_business_cash_ledger_no_update` · `set_updated_at` 계열 트리거도 전부 `tgenabled = O`. **비활성 트리거 0** (P0-5 수수료 트리거 재활성 상태 유지 확인).

## 2. 마이그레이션 기록 누락 (version > 20270401 · 보고만 · INSERT 안 함)

- 운영 `schema_migrations` (>20270401): 26건, 최대 `20270602140200`.
- 저장소 파일 (>20270401): 143개 · 고유 version 141 (`20270512120000`·`20270515120000` 은 파일 2개가 같은 version — 기록 시 1건만 가능, 리네이밍 필요 여부는 메타 기록 단계에서 판단).
- **저장소에만 있고 운영 기록 없음: 118 version** — 함수가 운영에 존재하는 것(위 표 MATCH: `20270421120000`·`20270421120200`·`20270421120300`·`20270510120000` 등)이 포함되어 "기록 누락 ≠ 미적용". 적용 여부는 버전별 객체 확인 후 Owner 승인 하에 메타만 기록(FIN-10 ②).

```
20270403120000 20270404180000 20270404190000 20270406120000 20270410120000 20270411120000 20270412120000
20270414120000 20270414120100 20270414120200 20270414130000 20270414140000 20270414140100 20270414140200
20270414150000 20270414160000 20270414170000 20270414180000 20270414190000 20270414200000 20270414210000
20270420120000 20270420120100
20270421120000 20270421120100 20270421120200 20270421120300 20270421120400 20270421120500
20270422120000 20270422130000 20270422140000 20270424120000 20270425120000
20270502120000 20270503120000 20270504130000 20270505120000 20270505121000 20270505122000 20270505130000
20270507120000 20270508120000 20270508130000 20270509120000 20270510120000 20270511120000 20270512120000
20270513120000 20270514120000 20270515120000 20270515121000 20270516120000 20270518120000 20270519120000
20270521120000 20270521120100 20270521120200 20270521120300 20270521120400 20270521120500 20270521120600
20270521120700 20270521120800 20270521120900 20270521121000 20270521121200 20270521121300
20270522120000 20270522120100 20270522120200 20270522120300 20270522120400 20270522120500 20270522120600
20270523120000 20270523120100 20270523120200 20270523120300 20270523130000
20270524120000 20270525120000 20270526120000 20270526121000 20270526122000 20270526123000 20270526124000
20270601100000 20270601100100 20270601100200 20270601100300 20270601120000 20270601120100 20270601130000
20270601131000 20270601132000 20270601133000 20270601140000 20270601141000 20270601142000 20270601143000
20270601150000 20270601150100 20270601160000 20270601161000 20270601162000 20270601163000 20270601164000
20270601165000 20270601166000 20270601170000 20270601171000 20270601172000 20270601180000 20270601182000
20270601190000 20270601191000 20270601200000
```

- **운영에만 기록되고 저장소 파일 없음**: `20270405120000` (security_lints_intro_opening_advisor_close) · `20270409120000` (os_entry_screen_config) · `20270426120000` (security_lints_advisor_warn_close).

## 3. 다음 단계 (FIN-10 잔여)

- ② 메타 INSERT — Owner 승인 필요(이 블록에서 미수행).
- 2단계 DB 블록은 함수 교체 직전에 운영 md5 를 다시 받아 `fin10-prod-function-md5.json` 갱신 → `npm run verify:prod-function-drift -- --strict` PASS 를 선행 조건으로 한다.
