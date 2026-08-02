# Phase 4 — Owner store_id Authority Separation Evidence (2026-08-02)

**Status:** Phase 4 CODE PASS  
**NOT declared:** HARD LOCK · RUNTIME PASS · PRODUCT PASS

## Locked behaviors

| Surface | Authority |
|---------|-----------|
| Owner FAB order chat | `storeOrderChatUnread` (hub store_id scope) |
| Owner FAB orders/store | orderAttention / inquiry+review |
| Bottom stores (hasOwnerStore) | **0** — Owner attention never on member Bottom |
| Member Bell / App Icon | Owner intake + owner rooms = **+0** |
| Domain Projection apply | preserves FAB + Owner ops axes |

## Code

- `applyDomainAuthorityHubBadgeOptimistic` — explicit preserve of Owner ops + store-scoped FAB
- Tests: `badge-axis-owner-separation-contract.test.ts` + existing owner-fab-header-contract

## Next

Phase 5 — Native single writer cleanup + Xiaomi/Samsung/iPhone device evidence. HARD LOCK only after 3-device.
