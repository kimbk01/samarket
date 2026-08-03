# Badge Authority — Current Map (Phase 0 Audit)

**Status:** AUDIT ONLY — no code change  
**Date:** 2026-08-02  
**HEAD:** `1e2a560c1` — *Revert "feat(badge): preserve A/B/Owner axis projection for production runtime QA"*  
**origin/main:** same as HEAD  
**Verdict this doc:** map only — **not** AUDIT PASS / CODE PASS / HARD LOCK

---

## A. Start baseline

| Item | Value |
|------|--------|
| HEAD | `1e2a560c102cc3605a2ef29dcf68ccda0bd08a14` |
| origin/main | same |
| Last product attempt | `059b7dcbd` + `d6c689ef5` (A/B/Owner axis) → **fully reverted** by `06b06a7ad` + `1e2a560c1` |
| Production / Vercel (prior QA note) | alias pointed at deploy while git was `d6c689ef5` — **stale vs current HEAD** |
| APK SHA (baseline log) | `3257c9dd…ae8663` installed on Samsung/Xiaomi during pre-revert QA |
| Dirty tree | many untracked `.qa-logs/**`, cursor rules; working tree post-revert |
| Prior runtime | `.qa-logs/badge-authority-rebuild/runtime-ab-3device/*` → `RUNTIME_PARTIAL_OR_FAIL` |
| HARD LOCK | **NOT DECLARED** |

---

## B. Live product formula (CURRENT HEAD — Phase B)

Source of truth in code comments / builder:

- `lib/notifications/chat-notification-attention-projection.ts`
- `lib/notifications/build-notification-badge-projection.ts`
- `lib/notifications/domain-app-icon-badge.ts`

```text
ChatAttentionTotal =
  |GD unread rooms|
  + |Group unread rooms|
  + |Trade unread rooms|
  + |Customer SO unread rooms|
  + |Owner SO unread rooms|

NotificationAttentionTotal =
  |distinct active non-chat attention_key|
  (chat_message-family EXCLUDED)
  (room-bound missed_call EXCLUDED)
  (admin_marketing_banner EXCLUDED)
  (orphan missed_call INCLUDED)
  (owner_intake order_status keys INCLUDED if rows exist on user_id)

BellBadge            = NotificationAttentionTotal
BottomChat           = |GD| + |Group|
TradeHub             = |Trade|
CustomerOrderHub     = |Customer SO|
OwnerHub / FAB chat  = |Owner SO| (store-scoped shell on FAB)
AppIconTotal         = ChatAttentionTotal + NotificationAttentionTotal
Native / FCM / APNS  = echo AppIconTotal
Row badge            = participant.unread_count (messages)
```

### Conflict vs this instruction’s target A/B/C

| Axis | Instruction target | CURRENT HEAD |
|------|--------------------|--------------|
| A Member | persistent member inbox only; no chat; no store ops | ≈ NotificationAttention but **includes owner_intake** on owner `user_id` |
| B Comm | unread rooms + unresolved missed; store chat by identity | ChatAttention includes **owner rooms in member App Icon** |
| C Owner ops | store_id authority; never member Bell/A | C still written as `notification_events` to **owner user_id**; FAB has separate orderAttention |
| App Icon | `A + B` (member); C off icon until decided | `Chat(incl. owner rooms) + Notification(incl. owner intake)` |
| Bell | A only | NotificationAttention (not pure A) |

---

## C. Authority pipeline (as-is)

```text
Fact producers
  loadMessengerUnreadRoomFactsFromParticipants     → GD / Group room IDs
  loadTradeStoreOrderUnreadRoomFactsFromParticipants → Trade / Customer / Owner IDs
  loadOrphanMissedCallFacts / event rows           → orphan missed + attention keys
  notification_events (user_id)                    → NotificationAttentionTotal
        │
        ▼
buildUnifiedAppIconProjection / buildNotificationBadgeProjection  (pure)
        │
        ▼
build-domain-badge-authority-http / badge-count route
        │
        ▼
Projection Authority (COMPLETE gate)
        │
        ▼
applyNotificationBadgeProjection
  ├─ applyBellBadgeProjection → notification-badge-count-store → Header Bell
  ├─ domain-badge-surface-store.appIconTotal → NativeBadgeSync / Cap Badge.set
  ├─ messenger-bottom-chat-unread-projection → Bottom Chat
  └─ applyDomainAuthorityHubBadgeOptimistic → Trade / Customer / Owner axes
        │
        ▼
Hub GET (owner-hub-badge) — FAB storeOrderChatUnread + orderAttention (commerce)
Push embed — notify-push-dispatcher badge_count = appIconTotal
```

---

## D. Surface map

| Surface | Unit | Current source | Instruction target |
|---------|------|----------------|--------------------|
| Header Bell | attention keys | Bell store ← NotificationAttention | A only |
| Inbox list | events | `/api/me/notifications` + filters | A list only |
| Bottom Chat | rooms | Domain Apply (GD+Group) | same |
| Trade Hub | rooms | Domain tradeHub | same |
| Customer Order Hub | rooms | buyerOrderAttention / customer rooms | same |
| Room row | messages | participant.unread_count | same |
| Owner FAB chat | rooms @ store | Hub GET `storeOrderChatUnread` | B store chat |
| Owner FAB orders | action counts | Hub `orderAttention` / targets | C |
| App Icon | rooms+attention | Domain appIconTotal | A+B (no C) |
| FCM/APNS badge | same | dispatcher / APNS | snapshot echo only |
| Android launcher | same | Cap + summary carrier `setNumber` | echo only |

---

## E. Inflated digit — formula trace (how “large” numbers appear)

Instruction asks to trace numbers like **46**. No durable log in this workspace literally labels `46` as SSOT; **composition rule** below reconstructs any large App Icon from current axes.

### Example from runtime report (Samsung, pre-full-revert QA host)

From `.qa-logs/badge-authority-rebuild/runtime-ab-3device/1785651504454/report.json` (`beforeB`):

```text
A / bell     = 0
gd           = 0
group        = 0
trade        = 3
buyer        = 17
ownerRooms   = 5
orphan       = 0
appIcon      = 20
```

**A/B-axis QA formula then used:** `appIcon ≈ A + (gd+group+trade+buyer+missed)` = `0+20` (ownerRooms excluded from that expectedApp).

**CURRENT HEAD Phase B formula would instead be:**

```text
AppIcon =
  gd + group + trade + buyer + ownerRooms   // ChatAttention
  + NotificationAttentionTotal              // may add owner_intake etc.

If same room facts + A=0 + owner intake K:
  AppIcon = 0+0+3+17+5 + K = 25 + K
```

Any observed N (including ~46) expands as:

```text
N = |GD| + |Group| + |Trade| + |Customer| + |Owner|
  + |distinct non-chat attention_key on user_id|
```

Common inflation sources under CURRENT HEAD:

1. Many unread **rooms** (buyer SO especially) counted into App Icon  
2. **Owner rooms** counted into member App Icon ChatAttention  
3. **Owner intake** events on `user_id` counted into Bell + App Icon NotificationAttention  
4. FCM/native echoing that total (not inventing) — still looks “wrong” on launcher  

---

## F. Prior A/B attempt (reverted — historical only)

`059b7dcbd` introduced documented contract (recovered via `git show`):

```text
memberAppIconTotal =
  memberNotificationUnreadTotal
  + GD + Group + Trade + Customer rooms
  + missedCallCount
  − Owner rooms
  − storeOwnerAttention
```

Runtime on dirty/partial tree: A up/down often OK; **B room read / B up** repeatedly FAIL; Owner isolation API checks sometimes PASS. Then **full revert** to Phase B — current HEAD.

---

## G. Phase 0 stop line

This map freezes **what exists now**.  
Next instruction Phase 1 = Authority Contract tests — **not started**.  
**No code modify / no re-apply of reverted commits** until Phase 0 audits accepted.
