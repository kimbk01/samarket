# Gate 3 Step 7 — Owner C writer classification

| Writer | 현재 역할 | 새 역할 | 분류 | 중복 방지 키 |
|--------|-----------|---------|------|--------------|
| `store_orders` Action Required (pending/refund/cancel) | C_operational facts | Sole C_operational input | **KEEP** | `store:{storeId}\|ACTION\|entityId` |
| `store_inquiries` open tickets | C_operational inquiry | Sole inquiry digit | **KEEP** | `store:{storeId}\|OPEN_STORE_INQUIRY\|id` |
| Owner participant unread rooms | B_store / C_chat | Sole C_chat room count | **KEEP** | `(storeId, roomId)` |
| `resolveStoreOwnerAuthority` | (new) | Canonical C snapshot + surfaces | **KEEP** (SSOT) | `store:{storeId}` + contentKey |
| `fab_owner_orders` / `fab_owner_store` targets | Dual/legacy digits | ADAPTER until cutover; must not override C | **ADAPTER** | prefer C authority |
| `notifyStoreOwner*` → user_id `owner_intake` | Contaminant to A | Excluded from A; not C truth | **DELETE** (as A/C authority) | — |
| Member Bell / App Icon apply of C | Leak risk | Forbidden (`OWNER_C_FORBIDDEN`) | **DELETE** | — |
| Owner push without store recipient | Wrong admin | `assertOwnerPushRecipientStore` gate | **ROUTE** | `store:{storeId}` |
| UI Owner FAB `badge++/--` | Invent | Forbidden | **DELETE** | — |
| Cap resume / room identity fallback | Residual risks | Out of Step 7 scope | **KEEP** (untouched) | — |

```text
Step: 7
Canonical Owner C publisher: 1 (resolveStoreOwnerAuthority per store)
Member App Icon C writers: 0
```
