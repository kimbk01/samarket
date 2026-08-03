# Notification A — Runtime Map (Phase 2A)

**HEAD:** `1e2a560c1` · **Runtime edits this phase:** none

Target: Member A only (`user:{user_id}`). Bell = A. App Icon A component = A.

---

## Writers / sources

| File | Symbol | Event kinds | Identity today | Count unit | Surfaces | Violation | Verdict |
|------|--------|-------------|----------------|------------|----------|-----------|---------|
| `lib/notifications/core/notification-event-repository.ts` | `createNotificationEvent` | all typed events | `user_id` | event row | insert SSOT | C also uses this with user_id | **KEEP** insert SSOT; classify ROUTE |
| `lib/notifications/append-user-notification.ts` | `appendUserNotification` | trade/community/commerce wrappers | `user_id` | event | → createNotificationEvent | owner commerce via same path | **ROUTE** A vs C |
| `lib/notifications/notify-store-commerce.ts` | buyer status helpers | buyer order/delivery status | buyer `user_id` | attention | Bell/A | none for buyer A | **KEEP** as A |
| `lib/notifications/notify-store-commerce.ts` | `notifyStoreOwnerNewOrder` (+ reminders/cancel/sold_out…) | owner ops | **owner user_id** | attention `owner_intake` | Bell + NotificationAttention + App Icon A-axis | **C as A** | **REWRITE** → C_store; A/Bell path **DELETE** |
| `lib/notifications/notify-user-points.ts` / `notify-store-points.ts` | points notifies | points | `user_id` | event | Bell if eligible | classify each | **ROUTE** (A or none) |
| `lib/notifications/community-*-inapp-notify.ts` | social/group in-app | community | `user_id` | event | Bell if non-chat | chat types must stay out of A | **KEEP**/classify |
| `lib/admin/notification-campaigns/campaign-send-user.ts` | campaign send | `admin_notice` / `admin_marketing_banner` | `user_id` | event | Bell (notice); marketing digit exclude | marketing inbox policy | **KEEP** notice→A; marketing **BLOCK** inbox digit |
| trade status via append | trade_status | member | `user_id` | attention | Bell/A | none | **KEEP** |

---

## Attention / Bell digit

| File | Symbol | Role | Violation | Verdict |
|------|--------|------|-----------|---------|
| `lib/notifications/core/notification-attention-key.ts` | `resolveNotificationAttentionKey` | key SSOT; maps owner new_order → `order_status:owner_intake:{orderId}` | key used for A digit | **REWRITE** C keys out of A |
| `lib/notifications/chat-notification-attention-projection.ts` | `buildNotificationAttentionProjection` | NotificationAttentionTotal | includes orphan missed + owner_intake; excludes chat | **REWRITE** — A-only filter; missed→B; owner→C |
| `lib/notifications/load-bell-explain-unread-events.ts` | `loadBellExplainUnreadEventRows` | `eq(user_id)` all unread | no store-ops exclusion | **ROUTE** A classifier |
| `lib/notifications/bell-explain-matrix.ts` | `buildBellExplainMatrix` | diagnostics + digit | digit = NotificationAttentionTotal | **ROUTE** |
| `lib/notifications/pipeline/build-domain-badge-authority-http.ts` | badge-count builder | wires attention → Bell/App Icon | owner_intake in Bell | **REWRITE** Slice 2-2 |
| `lib/chat-domain/projections/bell-badge-projection.ts` | `applyBellBadgeProjection` | Bell store commit | commits contaminated total | **KEEP** commit; input must become pure A |
| `lib/notifications/notification-badge-count-store.ts` | store + `ensureInitialBadgeSnapshotForBoot` | Bell UI + boot | consumes contaminated | **KEEP** store; **ROUTE** source |
| `components/philife/PhilifeHeaderNotificationInbox.tsx` | Header Bell UI | displays store.total | | **KEEP** UI; source ROUTE |
| `components/my/MyNotificationsView.tsx` | full inbox | list | owner filter partial | **ROUTE** list = A only |
| `lib/notifications/inbox-events-merge.ts` | list filters | `excludeOwnerList` / chat | digit may still include owner | **REWRITE** digit∩list |
| `lib/notifications/owner-store-commerce-notification-meta.ts` | `isOwnerStoreCommerceNotificationRow` | list exclude helper | digit not using same gate | **KEEP** helper; apply to A digit |

---

## Read / delete

| File | Symbol | Clears | Verdict |
|------|--------|--------|---------|
| `lib/notifications/inbox-read-bridge.ts` | mark single/thread/category | events | **KEEP**; ensure mark-all ≠ B/C |
| `lib/notifications/pipeline/notify-read-service.ts` | read service | events | **KEEP**/ROUTE |
| `lib/notifications/core/notification-event-repository.ts` | mark read APIs | `read_at` | **KEEP** |
| `app/api/me/notifications/route.ts` | GET/PATCH mark_all | events by user | **REWRITE** exclude C rows from A mark-all side effects once C moved |
| FCM tap → read | notify / deep link bridges | event | **ROUTE** A only |

---

## NotificationAttentionTotal key classification (current → target)

| Key / type pattern | Current digit | Target |
|--------------------|---------------|--------|
| `trade_status:*` | NotificationAttention / Bell | **A_member** |
| `order_status:buyer:*` / buyer status kinds | Bell | **A_member** |
| `order_status:owner_intake:*` | Bell | **C_store** |
| other `order_status:owner_*` / fee | Bell (often) | **C_store** or classify |
| `admin_notice` / admin dedupe | Bell | **A_member** |
| `admin_marketing_banner` | excluded from digit | **ephemeral/no badge** |
| `missed_call` orphan | Bell (NotificationAttention) | **B_member** |
| `missed_call` room-bound | excluded from attention | **B** (room path) |
| chat_* types | excluded from attention | **B** (rooms); not A |
| `incoming_call*` | DIGIT_EXCLUDED | **none** |
| unknown types falling through `dedupe \|\| type:unknown` | may enter attention | **unknown/block** — never auto-A |

---

## FCM relation (A)

`notify-push-dispatcher` embeds `badge_count = appIconTotal` (contaminated). Tap should mark A when persistent. Slice 2-6 for transport-only.

---

## Slice

Primary: **2-2 A Member Notification** (after 2-1 classifier types).  
Prerequisite pollution fix: stop owner_intake entering Bell before claiming A CODE PASS.
