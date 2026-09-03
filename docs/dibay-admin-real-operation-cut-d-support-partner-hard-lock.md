# DIBAY Admin Real Operation — CUT D SUPPORT + PARTNER CONTEXT LINKAGE

**Status:** HARD LOCK (CUT D)  
**Companion:** `lib/admin/admin-real-operation-cut-d-support-partner-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-d-support-partner-hard-lock`  
**Depends on:** CUT A · CUT B · CUT C (do not squash)

## Purpose

Admin operators open a Support case and reach **canonical** Member / Store / Ad / Finance / Partner screens without re-searching — without Support becoming a second mutation authority.

## Separation (MUST)

| Surface | Meaning |
|---|---|
| SUPPORT CASE | User ↔ Admin customer support (`lib/support/*`) |
| DELIVERY OPS THREAD | Admin ↔ Owner product ops on an ad execution |
| LEGACY PLATFORM INQUIRY | Archive / redirect / 410 NO_NEW_WRITE |

Do **not** merge tables or invent `/admin/support-v2`.

## Reference model

`support_cases.reference_type` + `reference_id` → canonical domain read.  
No snapshot duplication (`store_name`, `cash_balance`, `ad_status` on support rows).

CUT D reference extensions (create-path validated):

- `FEED_AD_REQUEST`
- `PLATFORM_POPUP_OWNER_REQUEST`
- `POINT_CHARGE_REQUEST`
- `BUSINESS_CASH_CHARGE_REQUEST`
- `PARTNER_MEMBERSHIP`

Existing Delivery: `AD_CAMPAIGN` / `DELIVERY_AD_CAMPAIGN`.

## Partner

Partner = **Membership** ≠ AdProduct. Fee = Cash. UI links Store / Finance / Ads / Support only.

## Carry (NOT deleted)

From CUT B/C:

- FINANCE OPERATION UX: PARTIAL
- FINANCE PRODUCTION E2E: NOT_PROVEN
- COIN SALE RECOGNITION: NOT_PROVEN
- DELIVERY ADS OPERATION: PARTIAL
- POPUP RUNTIME: NOT_PROVEN
- RESUME/END LIVE: NOT_PROVEN
- PREVIEW LIVE PARITY: NOT_PROVEN
- TABLET *: NOT_PROVEN

Support/Partner linkage PASS ≠ Popup runtime PASS ≠ Ads E2E complete.

## Gate

```bash
npm run verify:admin-real-operation-cut-d-support-partner-hard-lock
```
