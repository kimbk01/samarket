# Slice 2-1 — Classification Foundation

**Status:** CODE PASS (foundation only)  
**HEAD baseline:** `1e2a560c1`  
**Product digits connected:** **No**

## Modules

| File | Role |
|------|------|
| `badge-authority-types.ts` | `BadgeAuthority` / `BadgeAuthorityClassification` / `BadgeSurface` |
| `badge-event-classifier.ts` | `classifyBadgeAuthority`, `resolveBadgeRecipientIdentity` |
| `badge-authority-assertions.ts` | identity/surface assertions |
| `badge-surface-eligibility.ts` | allowed surfaces per authority |

## Classification

- `A_MEMBER_NOTIFICATION` · `B_MEMBER_COMMUNICATION` · `B_STORE_COMMUNICATION` · `C_STORE_OPERATION`
- `EPHEMERAL_NO_BADGE` · `UNKNOWN_BLOCKED` (never auto-counted)

## owner_intake

- With `storeId` → `C_STORE_OPERATION` + `store:{storeId}`
- Without `storeId` → `UNKNOWN_BLOCKED` (`STORE_ID_REQUIRED_FOR_OWNER_INTAKE`) — **no** ownerUserId→store fallback
- Documents rewrite target: `notifyStoreOwnerNewOrder_user_id_writer` (Slice 2-5)

## Owner Store Order chat

- customer→store / owner role → `B_STORE_COMMUNICATION`
- store→customer / buyer → `B_MEMBER_COMMUNICATION`
- `B_STORE` → `MEMBER_APP_ICON` assertion fails
