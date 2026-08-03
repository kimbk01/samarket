# Badge Writer / Reader Audit (Phase 0)

**Status:** AUDIT ONLY — no code change  
**Date:** 2026-08-02  
**HEAD:** `1e2a560c1`  
**Verdict:** inventory + KEEP/ROUTE/DELETE **candidates** only — not executed

Disposition legend:

- **KEEP** — remains in product path after A/B/C lock (possibly re-bound)
- **ROUTE** — keep code but change identity / surface binding
- **DELETE** — must leave product commit path (may quarantine later)

---

## 1. Increase Writers

| File / entry | Function / path | Input event | Identity key | Dedupe key | Targets A/B/C (as-is → target) | Surfaces hit | Problem | Disposition |
|--------------|-----------------|-------------|--------------|------------|--------------------------------|--------------|---------|------------|
| `lib/notifications/core/notification-event-repository.ts` | `createNotificationEvent` | all typed events | `user_id` | `dedupe_key` / attention_key | mixed → should split A vs C | Bell digit via Projection | Single insert SSOT but identity = user only | KEEP insert; **ROUTE** C away from member A |
| `lib/notifications/append-user-notification.ts` | `appendUserNotification` | trade/community/commerce wrappers | `user_id` | per caller | often A; owner commerce → pollutes A | Bell / App Icon notification axis | Owner new order uses owner user_id | ROUTE owner kinds → C |
| `lib/notifications/notify-store-commerce.ts` | `notifyStoreOwnerNewOrder` (+ reminders, cancel, sold_out…) | store ops | `ownerId` as user_id | `commerce:owner:…` | **C written as A** | Bell + App Icon NotificationAttention | Primary identity contamination | ROUTE → store ops authority |
| `lib/notifications/notify-store-commerce.ts` | buyer status notifies | buyer status | buyer `user_id` | `commerce:buyer:…` | A ✓ | Bell / App Icon A | Correct for member | KEEP |
| `lib/notifications/notify-store-points.ts` / `notify-user-points.ts` | points events | points | `user_id` | dedupe | A or ambiguous | Bell | Confirm persists_in_inbox | KEEP / classify |
| `lib/notifications/community-*-inapp-notify.ts` | social / group in-app | community | `user_id` | dedupe | often A | Bell | Ensure not chat-message digit | KEEP if non-chat |
| `lib/admin/notification-campaigns/campaign-send-user.ts` | campaign send | admin | `user_id` | campaign keys | `admin_notice`→A; marketing→exclude | Bell / push | Marketing digit exclude exists | KEEP; harden `badge_effect=none` |
| message notify pipelines (`notify-message-pipeline` / CM paths) | chat_* inserts | message | room + user | room / message | events exist; digit excludes chat types | tray / history | Events can still clutter inbox if list filter fails | KEEP insert; list/digit ROUTE |
| Room unread writers (participants) | message INSERT / mark path | message | room + participant | `message_id` | B | rooms / hubs / App Icon chat axis | SSOT for B rooms | KEEP |
| Missed call pipeline | `notify-missed-call-pipeline` | missed call | user / room | call/dedupe | orphan→NotificationAttention; room-bound→row | Bell (orphan) / App Icon | Instruction: missed ∈ B not A | ROUTE orphan missed → B |
| Hub orderAttention loaders | pending order / refund counts | order state | `store_id` | order id | C | Owner FAB orders | Separate from Bell — good | KEEP as C |
| FCM `badge_count` embed | `notify-push-dispatcher` | push send | device | n/a | echoes AppIcon | launcher | Not authority — OK if snapshot | KEEP echo |
| Android `DibayFirebaseMessagingService` / summary `setNumber` | OS tray | FCM | device | n/a | echo | launcher | Multi-emitter risk if not same total | KEEP echo-only |
| iOS Cap / APNS `aps.badge` | push / Cap | | device | | echo | icon | | KEEP echo-only |
| Capawesome `Badge.set` via `sync-native-badge-count.ts` | NativeBadgeSync | projection | device | | echo AppIcon | icon | | KEEP |
| Realtime / boot / dirty poll | Projection rebuild triggers | room/event | user | eventIdentity / version | rebuild B/A | all Domain surfaces | Triggers ≠ writers — OK | KEEP |
| Optimistic room fact | `commitCmRoomUnreadFactEvent` | RT unread | room | eventIdentity | B | Bottom / App Icon | Must not invent Bell | KEEP |
| Legacy `notifications` table merge | dual-read adapters | legacy | user | | banned digit | | Phase4 quarantine | DELETE from digit path |

---

## 2. Decrease Writers

| Trigger | Path | Clears | As-is risk vs instruction |
|---------|------|--------|---------------------------|
| Single notification read | inbox-read-bridge / event read APIs | matching `notification_events` | Good for A; must not clear rooms |
| Mark all read (Bell) | PATCH mark_all / inbox | viewer unread events | Must not clear B/C; owner rows on same user_id get wiped with A — **contaminated** |
| Event delete / dismiss | delete paths | `deleted_at` / unread false | Need parity with A formula |
| Room mark-read | CM / trade / SO mark-read + ACK | participant unread → 0 | Instruction: require readable cursor — audit viewport-only paths separately |
| Domain badge read ACK | `domain-badge-read-ack` → Projection Apply | surfaces | Rebuild after facts — KEEP |
| Owner order accept / status | commerce notify + Hub attention recompute | C orderAttention | Must not zero C on mere open |
| Missed call seen | missed-call read | event | Must −1 once (not stub+event) |
| Logout / auth epoch | `resetNotificationBadgeCountForAuthEpoch` + clearNative | all → 0 | KEEP wipe |
| Store switch | Hub refetch by storeId | FAB shell | Must not leak other store digits |
| Destination-open supersede | status-event lifecycle | prior status attentions | KEEP with A taxonomy |

---

## 3. Readers / consumers

| Consumer | Reads | Authority? |
|----------|-------|------------|
| Header Bell (`PhilifeHeaderNotificationInbox` / Tier1) | `notification-badge-count-store.total` | Yes (Bell digit) |
| Inbox UI (`MyNotificationsView`) | `/api/me/notifications` | List SSOT events |
| BottomNav chat badge | messenger bottom projection | Yes (GD+Group rooms) |
| Trade / Customer hubs | hub axes from Domain Apply | Yes |
| Owner FAB | Hub GET orderAttention + storeOrderChatUnread | Mixed B+C display |
| Room list rows | bootstrap / participant unread | Yes (messages) |
| NativeBadgeSync | `domain-badge-surface-store.appIconTotal` | Echo |
| FCM/APNS | Builder `appIconTotal` at send | Snapshot echo |
| Android / iOS adapters | Cap / summary / APNS | Echo |
| Boot / resume | badge-count COMPLETE | Rebuild |

---

## 4. Duplicate / competing writers (risk)

| Risk | Detail | Disposition |
|------|--------|-------------|
| Cap Badge.set vs FCM setNumber vs APNS badge | Same number required; OEM race | KEEP all as **echo**; identity probe |
| Hub GET vs Domain Apply on hub axes | P1-c preserve Domain axes; FAB store-scoped separate | KEEP; verify no overwrite |
| NotificationAttention includes owner_intake while list may `excludeOwnerStoreCommerce` | Digit ≠ list subset | **FAIL vs A** — ROUTE |
| Chat events still inserted | Digit excludes; list may still show unless filter | ROUTE list = A only |
| Phase H / canary mirrors | Non-product | KEEP off product path |
| Heal scripts | Fact repair | DELETE from ops digit path |
| Reverted A/B modules (`badge-axis-taxonomy.ts` etc.) | Removed at HEAD | Do not resurrect without Phase 1 contract |

---

## 5. Writer singularity vs A/B/C target

| Surface | Single commit today? | Meets instruction? |
|---------|----------------------|--------------------|
| Bell digit | Yes → `applyBellBadgeProjection` | **No** — wrong membership (owner intake, orphan missed as A) |
| App Icon formula | Yes → Builder | **No** — owner rooms + contaminated A |
| Bottom Chat | Yes | **Yes** (GD+Group rooms) |
| Trade / Customer hubs | Yes | **Mostly yes** |
| Owner FAB chat | Hub store-scoped | **Yes direction** |
| Owner FAB ops | Hub orderAttention | **Yes direction** — not App Icon |
| Native | Echo AppIcon | Echo OK; formula wrong upstream |
| Room row | participant | **Yes** |

---

## 6. Removal candidates (product path)

1. Member Bell/App Icon counting of `order_status:owner_intake:*` and related owner meta kinds  
2. Member App Icon ChatAttention including `ownerOrderRoomIds`  
3. Treating orphan missed_call as Bell/A (move to B)  
4. Any local ±1 without Projection rebuild as authority  
5. Legacy notifications merge into Bell digit  
6. Marketing / ephemeral FCM with `badge_effect` affecting A/B  

---

## 7. Stop

Phase 0 Writer/Reader inventory complete.  
Implementation of KEEP/ROUTE/DELETE = Phase 1+ after approval.
