# Badge Identity Scope Audit (Phase 0)

**Status:** AUDIT ONLY — no code change  
**Date:** 2026-08-02  
**HEAD:** `1e2a560c1`

---

## 1. Identity keys in play

| Key | Where used | Role today |
|-----|------------|------------|
| `user_id` / `recipient_user_id` | `notification_events`, Bell digit query, badge-count | **Primary for A and wrongly for C** |
| `store_id` | Hub store attention, FAB, owner routes, order meta | C / store shell |
| `owner_user_id` / owner membership | Hub store lookup (`findOwnerHubStore`), notify owner | Resolves which user gets C events — then stored as user_id |
| `room_id` + participant | unread_count, mark-read | B room authority |
| Active store / persona | Owner admin / delivery shell | UI context; not always push identity |
| Device account / FCM token | push delivery | Delivery only |

Instruction target:

```text
Member notification identity = user:{user_id}
Store operation identity      = store:{store_id}
Store chat identity           = store:{store_id}:order:{order_id}
```

---

## 2. Contamination paths (evidence)

### 2.1 Owner ops → member Bell / NotificationAttention

**Writer:** `notifyStoreOwnerNewOrder` → `appendUserNotification({ user_id: ownerId })`  
**File:** `lib/notifications/notify-store-commerce.ts`  
**Attention key:** `order_status:owner_intake:{orderId}`  
**File:** `lib/notifications/core/notification-attention-key.ts`

Bell digit builder (`buildNotificationAttentionProjection`) excludes chat types and marketing, but **does not exclude owner_intake**.

**List UI** can filter via `isOwnerStoreCommerceNotificationRow` / `excludeOwnerStoreCommerce` (`inbox-events-merge.ts`, `resolve-tier1-bell-surface.ts`) — so **list may hide while digit still counts** (digit ≠ list).

| Check | Result |
|-------|--------|
| C written with store_id authority table? | **No** — row on owner `user_id` |
| Member Bell +0 on new order? | **No** — +1 attention key on owner user |
| Instruction violation | **Yes** |

### 2.2 Owner chat rooms → member App Icon

`buildChatAttentionProjection` sums `ownerOrderRoomIds` into `ChatAttentionTotal`.  
Builder uses `storeOrderForAppIcon = ownerForHub + buyer` for App Icon chat axis.

| Check | Result |
|-------|--------|
| Owner SO rooms in member App Icon? | **Yes (CURRENT HEAD)** |
| Prior approved A/B draft | Owner rooms **excluded** from memberAppIcon |
| Revert restored inclusion | **Yes** |

### 2.3 Same login, multiple stores

Hub FAB uses **active hub store** for `storeOrderChatUnread` / `orderAttention` (store-scoped) — correct direction for C/B-owner.

Domain `storeOrderOwnerUnreadRooms` can be **aggregate across stores** for hub axis — risk if UI treats aggregate as single-store.

Push deep links that land on member home without store membership check = contamination at navigation (see resolve inbox href owner branch — needs Phase 2 deep-link audit).

### 2.4 `user_id`-only badge-count

`build-domain-badge-authority-http` / badge-count loads events with `eq(user_id)` and room facts for that user — **no store identity partition** for A vs C.

---

## 3. Matrix: who should own which event

| Event | Correct identity | CURRENT write | CURRENT digit effect |
|-------|------------------|---------------|----------------------|
| Buyer order status | `user:{buyer}` A | buyer user_id | Bell/App Icon A ✓ |
| Owner new order | `store:{store}` C | owner user_id event | Bell/App Icon ✗ |
| Customer → owner message | store order chat B | participant unread | App Icon rooms (owner) ✗ for member icon policy |
| Owner → customer message | customer SO B | participant | App Icon buyer rooms ✓ for member |
| GD/Group/Trade message | member B rooms | participants | App Icon ✓ unit; ✓ domains |
| Orphan missed call | member B | notification_events + NotificationAttention | Counted as A-like attention ✗ |
| Admin notice | member A | user_id | Bell ✓ |
| Marketing banner | none | user_id event; digit exclude | Digit OK; tray may show |

---

## 4. Account combination audit checklist

Must be proven in later runtime (not claimed PASS here):

| Scenario | Required | CURRENT risk |
|----------|----------|--------------|
| Member only | A+B member; C=0 | OK if no store |
| Member + one store owner | A/B member separate from C | **Merged via user_id events + owner rooms in App Icon** |
| Multi-store owner | C(storeA) ⊥ C(storeB) | FAB store-scoped OK; aggregate owner rooms / events by user **leak** |
| Customer of store X + owner of store Y | buyer A/B vs owner C | Same user_id bag mixes keys |
| Account switch / logout | wipe all | auth epoch reset exists |
| Device shared | device badge = active account snapshot | depends on register/sync |

---

## 5. Paths that compute “everything” from `user_id`

1. `notification_events` unread → NotificationAttentionTotal → Bell + App Icon notification axis  
2. All domain room fact loaders for participant user → ChatAttention → App Icon  
3. Mark-all-read on member inbox → clears owner_intake rows on same user  
4. FCM badge_count snapshot for that user → launcher  

These are the **primary contamination funnels**. Store-scoped Hub GET is the main **non-contaminated** C reader today.

---

## 6. Disposition summary

| Issue | Disposition |
|-------|-------------|
| Owner commerce events on `user_id` | **ROUTE** to store ops authority; stop A digit |
| Owner rooms in member App Icon | **ROUTE** out of member App Icon (keep Owner FAB/B-store) |
| Orphan missed in NotificationAttention/Bell | **ROUTE** to B |
| List exclude without digit exclude | **FIX** — digit must match A membership |
| FAB orderAttention by store_id | **KEEP** as C projection |
| Dual identity in one session | **KEEP** separation; never sum stores by user_id |

---

## 7. Stop

Identity audit complete. No code change.
