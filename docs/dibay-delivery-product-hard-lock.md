# DIBAY Delivery Product HARD LOCK

**Status:** DELIVERY PRODUCT HARD LOCK  
**Locked at:** 2026-08-07  
**Repo HEAD at program start (reference):** `0f601f9a3` (`0f601f9a33a37b44b676c0e0f10f386e763f2392`)  
**Companion rule:** `.cursor/rules/dibay-delivery-product-hard-lock.mdc`  
**Gate:** `npm run verify:delivery-product-hard-lock`

This document freezes Delivery **architecture / authority / atomicity / recovery / cleanup** contracts.  
It does **not** redesign Delivery. It does **not** claim device UI E2E for every surface.

---

## 0. Program status at LOCK

| Stage | Status |
|---|---|
| Status Writer Unification | **CLOSED** |
| Order Creation Atomicity | **CLOSED** |
| Recovery Integrity | **CLOSED** |
| Structure Optimization | **CLOSED** |
| Repository Cleanup | **CLOSED** |
| Runtime Full Validation (DB/RPC/apply matrix) | **16/16 PASS → DELIVERY PRODUCT PASS** |
| HARD LOCK | **THIS DOCUMENT** |

### Product PASS scope (what YES means)

Directly verified PASS:

- `order_status` runtime writers = create insert `pending` + `applyStoreOrderStatusTransition` only
- Order create = `create_store_order_atomic` (stock + order + items + options + `order_created` in one TX)
- Cancel / refund / payment-failure / cancel_requested→cancelled stock restore via Recovery Chain in apply
- Structure: owner list snapshot meta, counts cache via honesty, coalesced invalidate, batched stock restore, hub unread single-pass, checkout store once
- Cleanup: dead slug-era owner UI/helpers removed; owner detail snapshot embeds `review`
- Runtime matrix (`scripts/runtime-delivery-phase-d-matrix.ts`): 16/16

### Intentional residual (NOT product FAIL)

| Residual | Status |
|---|---|
| Browser Realtime session UI | **NOT_RUN** this program |
| Customer / Owner / Admin HTTP cookie session UI E2E | **NOT_RUN** this program |
| Cron HTTP route (`/api/cron/store-orders-auto-complete`) | **NOT_RUN** — SYSTEM auto-complete **apply** path verified in matrix (O) |
| Refund reject writer | Deferred (UI Frozen) |
| Accept-after points fee reverse | Deferred |
| Outbox / retry queue | Deferred |

**Do not** phrase this LOCK as “every device surface E2E verified.”

---

## 1. Authority LOCK (SSOT)

| Concern | Owner (final) | Forbidden without reopen |
|---|---|---|
| `order_status` write | Create insert → `pending` · else **only** `applyStoreOrderStatusTransition` | Raw `.from("store_orders").update({ order_status })` outside apply/create |
| Order create | `public.create_store_order_atomic` + `createStoreOrderAtomic` | App-layer serial stock/item loops + compensate delete/restore |
| Cancel / refund / payment-failure recovery | apply Recovery Chain (CAS → stock → settlement → events → notify → chat → audit) | Parallel stock restore / duplicate cancel_* event emitters outside apply |
| Checkout business rules | `validateStoreOrderCheckout` (pre-TX) + TX revalidation for stock/price/sold-out/open | Duplicating fee/min-order rules inside RPC |
| Owner orders list read | OOL1 snapshot / `OwnerStoreOrdersView` path | Reviving deleted slug-era `OwnerOrdersPageClient` / `owner-order-remote` |
| Owner detail review on snapshot hit | `get_owner_store_order_detail_snapshot` embeds `review` | Re-adding post-RPC review fetch on snapshot success as primary path |
| Refund admin head | `adminCompleteRefundStoreOrder` (thin alias `applyAdminStoreOrderRefund` OK) | Second independent refund writer |

### Required migrations (runtime)

- `20261022120000_create_store_order_atomic.sql`
- `20261022130000_owner_store_order_detail_snapshot_review.sql`

---

## 2. Verify gates (must stay green)

Run together:

```bash
npm run verify:delivery-product-hard-lock
```

Includes:

| Script | Protects |
|---|---|
| `verify:store-order-status-writer-authority` | Writer SSOT |
| `verify:store-order-create-atomicity` | Atomic create path |
| `verify:store-order-recovery-integrity` | Recovery Chain convergence |
| `verify:store-order-structure-optimization` | Read-path / invalidate structure |
| `verify:store-order-repo-cleanup` | Dead paths stay deleted; snapshot review |

Optional runtime (ops / before major Delivery change):

```bash
npx tsx scripts/runtime-delivery-phase-d-matrix.ts
```

---

## 3. DO NOT (without explicit reopen)

- Reopen Status Writer / Atomic create / Recovery for “cleanup” or UI convenience
- Restore app-layer order create compensate (`restoreDecrementedStock` / stockRollback on create)
- Bypass `applyStoreOrderStatusTransition` for cancel/refund/admin force/cron complete
- Delete or hollow verify scripts above to force CI green
- Revive deleted slug-era owner order UI / `owner-order-remote` / meta-deduped dead helpers as product paths
- Claim Browser/UI/Cron-HTTP residual as PASS without new evidence
- Unfreeze Delivery Customer/Owner/Admin **UI** under this LOCK without product reopen

---

## 4. Reopen policy

Reopen HARD LOCK only when **one** of:

1. Proven **Code First Break** against locked Authority (§1) with runtime evidence  
2. Explicit product contract change (new payment PSP capture, new status graph, new create TX boundary)  
3. Security / compliance requiring contract edit  
4. Explicit user approval to unfreeze UI or residual E2E program

Reopen requires: update this doc + `.mdc` + keep gates enforcing the new contract in the **same** change.

---

## 5. Evidence

- Phase D matrix: `scripts/runtime-delivery-phase-d-matrix.ts` (16/16 PASS on 2026-08-07)  
- Contract scripts under `scripts/verify-store-order-*.mjs`  
- Migrations listed in §1

---

## 6. Final statement

**DELIVERY PRODUCT PASS — YES** (architecture / authority / atomicity / recovery / cleanup + DB/RPC/apply runtime matrix).

**HARD LOCK — ACTIVE.**

Browser Realtime · HTTP cookie UI · Cron HTTP route remain **intentional residual / NOT_RUN**, not FAIL.
