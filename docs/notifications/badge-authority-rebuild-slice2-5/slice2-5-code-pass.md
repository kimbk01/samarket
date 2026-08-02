# Slice 2-5 — C_store CODE PASS

**Date:** 2026-08-03  
**Baseline HEAD (pre-implement):** `c673ac444`  
**Authority Contract:** LOCK (unchanged formulas)  
**A_member / B_member / B_store:** not modified as authority

---

## Verdict

```text
SLICE 2-5 C_STORE CODE PASS
```

**Not declared:** RUNTIME PASS · PRODUCT PASS · HARD LOCK · Slice 2-6

---

## A. 수정 파일

| Path | Role |
|------|------|
| `lib/notifications/badge-authority-rebuild/store-operation-c-projection.ts` | C_store projection |
| `lib/stores/get-owner-hub-store-attention-counts.ts` | +`cancelPendingCount` |
| `lib/stores/owner-store-cancel-count.ts` | legacy cancel count |
| `lib/chats/build-owner-hub-badge-payload.ts` | state-only C; remove max(); review=0 |
| `lib/chats/owner-hub-badge-snapshot.ts` | cancel field; remove max(); review=0 |
| `lib/delivery/owner/owner-store-badge-display-policy.ts` | C ops header; inquiry-only FAB store |
| `lib/chats/use-owner-hub-badge-total.ts` | comment |
| `supabase/migrations/20261016120000_c_store_attention_cancel_pending.sql` | RPC + column |
| tests under badge-authority-rebuild + owner-fab-* | contract updates |
| this doc | CODE report |

Audit / Authority Contract docs: **not overwritten**.

---

## B. Runtime 영향

| Surface | Effect |
|---------|--------|
| Owner Hub / FAB orders | pending + refund + **cancel** |
| Owner FAB store | open inquiry only (no review) |
| Owner Header ops | **C only** (no B chat) |
| Owner FAB chat | B_store unchanged |
| Member Bell / App Icon | untouched |
| Native / FCM | untouched |

Requires DB migration applied for cancel count + snapshot field.

---

## C. 변경된 writer

| Writer | Change |
|--------|--------|
| `notifyStoreOwner*` | **not rewritten** this CODE (still transport; no longer dual-authority via max) |
| Hub attention SQL | **+cancel_requested** count |
| Target `fab_owner_orders` | **no longer** merges into `orderAttention` |

---

## D. 변경된 projection

| Before | After |
|--------|-------|
| `orderAttention = max(state, fab_owner_orders)` | `orderAttention = pending+refund+cancel` (state only) |
| `ownerReviewAttention = fab_owner_store - inquiry` | **0** (UNKNOWN_BLOCKED) |
| Header ops = C + B chat | Header ops = **C only** |
| Hub cancel omitted | Hub cancel **included** |

---

## E. 테스트

```bash
npx vitest run \
  lib/notifications/badge-authority-rebuild/__tests__/store-operation-c-projection.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/c-store-authority-contract.test.ts \
  lib/stores/__tests__/owner-fab-header-contract.test.ts \
  lib/stores/__tests__/owner-fab-badge-display.test.ts \
  lib/chats/__tests__/owner-hub-badge-store-cm-sync.test.ts \
  lib/chats/__tests__/owner-hub-cache-hit-store-order-refresh.test.ts
```

**67/67 PASS**

---

## F. CODE PASS 여부

**YES** — `SLICE 2-5 C_STORE CODE PASS`

---

## G. Runtime 미실행 여부

**YES — Runtime not executed** (no deploy / device QA in this step)

---

## H. 다음 단계

1. Commit + apply migration + Deploy  
2. Runtime QA (Action Complete decrease; no read-clear; cancel in Hub; no max dual)  
3. Only then PRODUCT / HARD LOCK  
4. **Do not** start Slice 2-6 automatically
