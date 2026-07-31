# Badge Authority — Phase 5 Legacy Inventory (2026-07-31)

Re-proof after Phase J residual review. Classification only — **no delete without importer-0 + runtime QA**.

| ID | Item | Class | Evidence |
|----|------|-------|----------|
| L-SPLIT-SHELL | `publishDomainBadgeShellToSurfaceStore` / `publishMissedCallToDomainBadgeSurface` | **ROUTE TO SSOT** | Deprecated wrappers → `publishDomainAppIconCompleteSnapshot`. Product bridge no longer calls split APIs. |
| L-TRADE-LEGACY-HREF | `buildTradeLegacyChatWebPath` (`/chats/:id`) | **QUARANTINE** | Bell trade rows now use CM room path. Helper kept for alias/entry intent compatibility. |
| L-INBOX-BRIDGE | `inbox-read-bridge` | **KEEP** | List/read adapter; digit writer 아님; invalidates badge cache after read. |
| L-LIST-75 | Notification list 75s poll | **KEEP** | List UX only (J residual). |
| L-HUB-HTTP | `GET /api/me/store-owner-hub-badge` | **KEEP** | Owner FAB / trade / store axes. Bottom Chat digit **not** from this store (Messenger projection). |
| L-PHASE-H-MIRROR | `applyAppIconBadgeProjection` | **KEEP** | Contract mirror; NativeBadgeSync must not read. |
| L-SO-DUAL | buyer_order + owner_order_chat | **KEEP** | Product dual-role semantics. |
| L-FRIEND-BELL | friend_request in Bell | **KEEP (retired)** | Contact SSOT; merge ignores legacy meta. |
| L-ADMIN-MKT-TOTAL | admin_marketing_banner in Bell total | **KEEP (excluded)** | Banner feed; `mapBadgeRpc` omits from `total`. |
| L-DOMAIN-NOTIF-AUTH | `domain-notification-authority.ts` Phase11 | **KEEP (canary)** | Native push forbidden; not App Icon SSOT. |

## DELETE CANDIDATE

**0** until Phase 6 Runtime PASS + importer-0 proof on quarantine wrappers.

## Importer notes (static)

- `applyMessengerBottomChatUnread(` — single call site: `applyDomainAuthorityHubBadgeOptimistic`
- `syncNativeBadgeCount` — NativeBadgeSync + logout clear
- Product App Icon apply — `publishDomainAppIconCompleteSnapshot` only
