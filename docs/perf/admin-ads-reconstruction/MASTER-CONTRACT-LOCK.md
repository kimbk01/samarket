# DIBAY ADVERTISING — MASTER CONTRACT (CORRECTED LOCK)

**Status:** LOCKED after Integrity Audit  
**HEAD at audit:** `43834e4a0`  
**Evidence owner:** CODE (this turn) · Production runtime: NOT_PROVEN  

This document **corrects** prior MASTER/plan claims that disagreed with code.  
Do not invent sellable products that lack writers.

---

## CORRECTIONS (vs prior MASTER / docs)

| ID | Wrong claim | Corrected truth (CODE) |
|----|-------------|------------------------|
| C1 | Trade Boost = immediate / no admin | Trade = HOLD → Admin approve → CAPTURE (`requiresAdminApproval: true`) |
| C2 | Community Boost = Admin approve (ADS-PRODUCT-CONTRACT) while CODE immediate | **TARGET LOCK:** Community = same as Trade (HOLD→Admin→CAPTURE). Flip `requiresAdminApproval` to true |
| C3 | paid-exposure master §1 Trade “none” | Superseded by CODE + this contract |
| C4 | Pixel guide covers all Delivery banner inventories | Guide keys = HERO + SEARCH_TOP + INLINE_1 + CATEGORY_TOP (Stage2). SSOT: `lib/ads/placement-creative-spec-ssot.ts` |
| C5 | Badge COUNT == actionable list | **FIXED** — `countDeliveryAdAdminActionQueue` uses same list funding filter |
| C6 | Delivery Sponsored Admin Direct sellable | Admin Direct Sponsored = **NOT_SELLABLE** (`NOT_IMPLEMENTED_MODEL_BLOCKED`) |
| C7 | Member Popup sellable | Member Popup = **NOT_SELLABLE** (Owner + Admin Direct only) |

---

## SELLABLE LOCK

| Product | Member | Owner | Admin Direct |
|---------|--------|-------|--------------|
| Community Boost | YES | — | — |
| Trade Boost | YES | — | — |
| Community Banner (Feed) | YES | — | YES |
| Trade Banner (Feed) | YES | — | YES |
| Community/Trade Popup | **NOT_SELLABLE** | surfaces via Owner Popup | YES (surface select) |
| Delivery Sponsored | — | YES | **NOT_SELLABLE** |
| Delivery Banner | — | YES (HERO) | YES (HERO / INLINE_1 / CATEGORY_TOP) |
| Delivery Popup | — | YES | YES |
| SEARCH_TOP banner | — | **NOT_SELLABLE** (launch) | NOT_SELLABLE |
| Partner | — | membership ≠ ad | — |
| Chat ads | **NOT_SELLABLE** | — | — |

---

## MONEY

| Product | Currency | Charge | Approve | Reject |
|---------|----------|--------|---------|--------|
| Trade/Community Boost | Point | HOLD at apply | CAPTURE | RELEASE |
| Feed Banner | Point | HOLD | CAPTURE | RELEASE |
| Delivery Sponsored/Banner | Cash (BC) | Debit on submit | — | Refund writer |
| Platform Popup (Owner) | Cash | Debit on submit | — | Refund path |

**Policy LOCK:** All **applicant-paid** products require Admin decision before ACTIVE exposure (Community Boost included after flip).

Admin Direct may use `ADMIN_NO_CHARGE` / zero debit where existing writer supports it — same campaign/renderer.

---

## CREATION SOURCE

`MEMBER_SUBMITTED` | `OWNER_SUBMITTED` | `ADMIN_DIRECT`  
Post-approve (or Admin Direct save) → **same** campaign · placement · resolver · client renderer.  
No parallel ads tables.

---

## ADMIN IA (TARGET — match design board)

1. 광고 홈  
2. 신청 관리  
3. 진행 중 광고  
4. 광고 만들기  
5. 노출 위치  
6. 상품 · 가격  
7. 결제 · 환불  
8. 광고 이력  

Forbidden labels: 광고 관제 · 집행 관리 · 배너 광고 집행.

Badge / home action counts: **COUNT QUERY === LIST QUERY** (funding-aware for Delivery).

Diagnosis (capacity / collision / vacancy): separate section — not action badge.

---

## CREATIVE SPEC

- Product UX: aspect · recommended px · min px · formats · crop · preview  
- Tech: max upload bytes / MIME (not shown as “ad quality” copy)  
- Delivery pixel SSOT: extend beyond HERO/SEARCH as inventories are sellable  
- Ratios from **renderer/inventory**, not mock examples (2:1 in design board = layout sample)

---

## POPUP FREQUENCY UI

Engine modes: CLOSE | SESSION | TODAY | DURATION | CAMPAIGN  
User-facing buttons: TODAY | DURATION | CAMPAIGN only (CODE). Do not invent “session once” unless SESSION is exposed.

---

## LEGACY DISPOSITION

| Surface | Disposition |
|---------|-------------|
| `post_ads` top_fixed/mid_insert | NOT_SELLABLE new apply · READ merge short-term |
| `trade_post_ads` | Admin KEEP short-term · Member CTA forbidden |
| `my_page_banners` | CMS · out of Ads product nav |
| `/admin/store-banner-ads` | DEAD redirect / API 410 |
| `promoted-items` | History under 광고 이력 |

---

## REFUND

- Reject/cancel unpaid HOLD → RELEASE  
- Feed Admin `end` → **no auto refund** until policy writer (`ADMIN_END_REFUND_POLICY_REQUIRED`) — do not invent  
- Delivery reject → existing Cash refund writer  

---

## COMPLETE GATE (unchanged)

Owner Delivery Banner · Admin Direct Banner · Popup · Boost/Sponsored full chains + Production proof.  
COMPLETE forbidden without PRODUCTION RUNTIME evidence.
