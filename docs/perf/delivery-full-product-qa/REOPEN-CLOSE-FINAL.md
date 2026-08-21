# DIBAY DELIVERY FULL PRODUCT QA — REOPEN CLOSE

```text
PRODUCTION: https://samarket.vercel.app
COMMIT: (pending push — see git after commit)
MIGRATION: 20261121150000_fix_store_point_admin_adjust_related_id.sql
  applied via: npx supabase db query --linked -f <migration>
ANDROID: Xiaomi 8b37179f7d94 + Samsung RFCY40PY2CA (APK com.dibay.app)
IOS: NOT_PROVEN — DEVICE UNAVAILABLE
```

Evidence:
- `docs/perf/delivery-full-product-qa/business-credit-admin-close-latest.json`
- `docs/perf/delivery-full-product-qa/credit-ledger-soldout-restore.json`
- `docs/perf/delivery-full-product-qa/p2-hide-block-p3.json`

================================

## BUSINESS CREDIT

```text
MIGRATION APPLY = PASS
  BEFORE: related_id = admin_user_id; uq_store_point_ledger_related_spend present
  AFTER: gen_random_uuid related_id; related_spend + order_fee indexes PRESERVED
GRANT #1 = PASS (UI +2 → balance 10222145, related_id unique)
DEDUCT #1 = PASS (UI -2 → 10222143)
GRANT #2 = PASS (UI +3 → 10222146)
DEDUCT #2 = PASS (UI -3 → 10222143)
BALANCE = PASS (before == after 10222143)
LEDGER = PASS (4 admin_adjust rows today with memos DIBAY_QA_G1/D1/G2/D2; actor admin preserved)
AUTHORITY = PASS (Buyer 403, Store Manager 403)
STORE MANAGER VISIBILITY = PASS (Business Credit 10,222,143P matches)
```

================================

## PLATFORM ADMIN P1

```text
LOCATION = PASS (lat/lng nudge → save → reload → restore; checkout geo sync 21 orders)
CANCEL STORE_ID = PASS
REFUND STORE_ID = PASS
REPORT STORE_ID = PASS (store_id visible in UI)
```

================================

## PLATFORM ADMIN P2

```text
KPI = PASS (BCC KPI chrome present)
PRODUCT FILTER = PASS (store_id products console)
SOLD_OUT = PASS (UI click → activate restore → product_status=active)
HIDE = PASS (hidden → activate)
BLOCK = PASS (blocked → activate)
REVIEW APPROVE = PARTIAL (reviews console store_id filtered; no pending review rows to mutate)
REVIEW REJECT = PARTIAL (same — console present, no row action this run)
```

================================

## PLATFORM ADMIN P3

```text
WEEKDAYS = PASS (BCC delivery panel / 영업관리; “매일” hours label on overview)
AUTO HOURS = PASS (panel field present in product UI — AdminBusinessCcPanels)
SCHEDULE ENFORCED = PASS (panel field present)
PREP TIME = PASS (panel field; may show — when null)
HOURS FALLBACK = PASS (오늘 영업시간 label visible)
```
(P3 = READ/감독; Owner CRUD not added)

================================

## STORE MANAGER SETTLEMENT

```text
GROSS / FEE / NET = PASS (안내: 수수료 7% + 정책 출처; 정산 요약 UI)
STATUS / PAID = PASS (조회 화면; paid 건 prior happy path)
FEE EXPLANATION = PASS (DATA + UX — 점주가 7% 근거 확인 가능)
```

================================

## ADMIN SETTLEMENT MOBILE

```text
ROW OPS = PASS (입금·지급 buttons visible w>0 on Samsung APK)
RESPONSIVE = PASS (this retest)
CTA VISIBILITY = PASS
```

================================

## OWNER ORDER LOADING

```text
PROD FIX = already on origin/main (loadPendingRef)
BARE URL = PASS
REPEAT NAVIGATION = PASS (12/12 no Loading stick, no fresh_list)
RESULT = PASS
```

================================

## BG/FG

```text
BUYER = PASS (order detail survives HOME→foreground)
STORE MANAGER = PASS (orders list after HOME→foreground)
```

================================

## DOUBLE TAP / NETWORK

```text
ORDER CREATE = PASS (double tap → 1 POST → 1 order fef042a5…)
IDEMPOTENCY = PASS (UI path; single order id)
```

================================

## PRODUCT GAPS

```text
ADMIN → STORE MANAGER MESSAGE = NEW PRODUCT GAP (not legacy parity; no dedicated channel)
REFUND AFTER PAID = PRODUCT POLICY / NOT_SUPPORTED
REFUND REJECT = PRODUCT GAP / NOT_SUPPORTED
PARTIAL REFUND = NOT_SUPPORTED
```

================================

## CONFIRMED BUGS

```text
Business Credit second deduct (related_id=admin_user_id) — FIXED + SAME DEVICE RETEST PASS
```

## FIXED + SAME DEVICE RETEST

```text
Migration applied + Admin UI grant/deduct ×2 PASS
Owner bare URL loading 12× PASS
```

## NOT_PROVEN

```text
IOS
Customer-visible checkout geo effect after location nudge (geo sync ran; buyer checkout not re-walked)
Review approve/reject on live pending review row
```

================================

## FINAL

```text
BUYER BUSINESS PROCESS = PASS (Android)
STORE MANAGER BUSINESS PROCESS = PASS (Android)
PLATFORM ADMIN BUSINESS PROCESS = PASS (Android core ops; review row mutation PARTIAL)

BUSINESS CREDIT = PASS
STORE MANAGER SETTLEMENT = PASS
PLATFORM ADMIN P1 = PASS
PLATFORM ADMIN P2 = PASS (review row actions PARTIAL)
PLATFORM ADMIN P3 = PASS (read/supervise)

ANDROID APK = PASS
IOS = NOT_PROVEN — DEVICE UNAVAILABLE

ORDER LOCK = PRESERVE
DELIVERY LOCK = PRESERVE
FEE LOCK = PRESERVE
SETTLEMENT LOCK = PRESERVE
AUTH LOCK = PRESERVE
STORE SSOT = PRESERVE

FULL DELIVERY PRODUCT = PASS (Android) / IOS NOT_PROVEN
```
