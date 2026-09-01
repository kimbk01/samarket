# Phase 1 Authority LOCK

**Status:** APPROVED / LOCKED  
**Approved:** 2026-08-05 (user)  
**Master Plan:** PARTIAL (unchanged)  
**Depends on:** `phase0-evidence-audit.md`  
**Roadmap:** `phase-roadmap.md` (FINAL)  
**Cleanup:** `phase1.5-cleanup-contract.md`  
**Exit Gates:** `phase-exit-gates.md`

## Three-currency reconstruction amendment (2026-09-02)

Currency authority is superseded by `docs/dibay-currency-ssot-hard-lock.md`: **Point, Coin, and Cash** are the only product currencies. References below to personal/store points are historical Phase 1 terminology. Former store-point/Business Credit data is archive-only and must never authorize UI, readers/writers, mutation CTA, navigation, notifications, or a product card. Customer Platform may operate member Point only; store Coin/Cash operations belong to canonical Store Finance.

## LOCK (Authority) — frozen

1. **P1–P10** Product Principles
2. **App IA:** 내정보 > 고객센터 (공지·FAQ·1:1 문의·받은 쪽지·이벤트?/약관) · Point; Bell → 원본만
3. **Admin IA:** Customer Platform → Dashboard (Action|Monitoring) → Content / Support / Point / Promotion(Events?) / Notification Engine / Analytics / Settings. Store Coin/Cash is under Store Finance.
4. **Notice:** `app_notices` SSOT; Campaign = Engine send; Settings push merge **제거 = Phase 2**  
5. **Inquiry vs Inbox:** product split; Inbox = Admin → **1 member**; segment = Notice/Marketing + Engine  
6. **Physical:** notes = Inquiry **candidate**; Inbox schema **deferred**  
7. **Currency:** Customer Platform operates member Point only; no historical store-credit product or balance merge
8. **Event:** no participatory SSOT until need proven  
9. **Engine:** CP push via Campaign or `createAndDispatchNotificationEvent` only  
10. **Cleanup / gates:** no opportunistic deletes in 2–6; 7 / 7.5 / 7.8 → RRR; six Exit Gates per Phase  

## Phase order (FINAL)

```
0 → 1(LOCKED) → 1.5 → 2 → 3 → 4 → 5 → 6 → 7 → 7.5 → 7.8 → RRR → PRODUCT PASS → HARD LOCK
```

## Phase 2 scope (next after 1.5)

- Notice CRUD + publish window on `app_notices`  
- Remove Settings notices push merge  
- CS notice list/detail board-only  
- FAQ (Phase 2 scoped)  
- Optional: Dashboard Action counts via admin-bell  

## Phase 2 out of scope

- Inbox physical migration · Point ledger-only · Event product · Taxonomy rename · Phase 7 mass delete  

## Still blocking MASTER PLAN PASS

Legacy DEVICE · Operator interview · Prod `app_notices` proof · Inbox physical · Taxonomy · Ledger-only · FX  

## Phase 1 Exit Gates

```
Phase: 1
Date: 2026-08-05
Product Gate: PASS — P1–P10 + IA LOCK approved
Authority Gate: PASS — SSOT contracts recorded; dual notice flagged for Phase 2 fix
Runtime Gate: N/A — docs-only Phase
Admin Gate: PASS — Admin IA LOCK does not worsen live menus yet (menu relocate = later)
Regression Gate: N/A — no code change
Cleanup Tag Gate: PASS — proceeds to Phase 1.5 tagging
Next Phase allowed: YES → 1.5
```
