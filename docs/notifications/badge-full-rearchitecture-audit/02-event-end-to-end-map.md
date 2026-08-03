# 02 — Event End-to-End Map

**Mode:** AUDIT ONLY · first break point per chain

---

## 1. Member notification (A)

```text
business event
  → notify / appendUserNotification / admin notice writers
  → notification_events (user_id)
  → classifyBadgeAuthority → A_MEMBER_NOTIFICATION
  → loadBellExplainUnreadEventRows
  → deriveMemberUnreadNotificationCount (attention keys)
  → badge-count.total → Bell digit
  → (parallel) GET /api/me/notifications → filter A list → Popup?/Full list
  → FCM: MemberAppIconTotal (A is component only)
  → App Icon A
  → markMemberANotificationsAllRead / delete_ids
  → digit ↓ · list ↓ · App Icon A ↓
```

| Stage | Status |
|-------|--------|
| Writer → events | LIVE (many writers) |
| A classify | LIVE (`member-notification-a-projection`) |
| Digit | LIVE attention-key count |
| Full list | LIVE event rows + exclude + A filter |
| Messenger popup A items | **BREAK** — popup does not load A inbox; shows chat important |
| Mark-all | LIVE dual: events + **legacy `notifications`** |
| Product same-set digit↔list | **BREAK / UNPROVEN live IDs** — unit differs by design of Slice 2-2 |

**First break for “Bell 3 / list empty”:** reader identity after A projection — digit path vs list path (unit/filter/cache), **not** FCM Slice 2-6.

---

## 2. Member chat (B_member)

```text
message INSERT
  → participant unread_count / last_read
  → room in unread room set (GD/Group/Trade/Customer)
  → row badge = message unread
  → Bottom (GD+Group) / Trade Hub / Customer Hub
  → App Icon B rooms
  → room read cursor
  → all B surfaces ↓ · Bell unchanged
```

| Stage | Status |
|-------|--------|
| Room set vs message row units | LIVE and intentional |
| Owner rooms excluded from member App Icon | LIVE when A-path projection used |
| Missed → B not Bell | LIVE in A filter; orphan in B count |

**Harness PASS (Slice 2-3)** covered clean fixtures for room/row/Bottom — **not** product Bell/list identity.

---

## 3. Owner chat (B_store)

```text
customer message
  → store-scoped owner participant unread
  → owner row
  → Owner Chat Hub/FAB (active store room count)
  → owner read
  → FAB ↓ · Member Bell/App Icon unchanged
```

| Stage | Status |
|-------|--------|
| Unit room count (not message sum) | LIVE after `5ee177ca6` |
| Cache HIT stale chat total | Mitigated by `c78dd7a1e` / `c673ac444` (invalidate/refresh) — residual SWR risk remains |
| Member surface exclusion | Projection KEEP; **RUNTIME product multi-surface not LOCK** |

---

## 4. Store operations (C_store)

```text
store_orders / store_inquiries state
  → get_owner_hub_store_attention_counts
  → orderAttention / inquiryAttention
  → Owner Ops Hub/FAB
  → Action Complete → ↓
  → notification read must not clear C
```

| Stage | Status |
|-------|--------|
| State RPC authority | LIVE (`aa2d46b09` + migration) |
| Dual max banned | LIVE |
| Residual `owner_intake` user_id events | **Still written** — filtered from A, **not** C truth |
| First structural debt | Writer still dual (state RPC + user_id events) |

---

## 5. Native / FCM

```text
server MemberAppIconTotal
  → resolveMemberAppIconTotalForNativeFcm
  → FCM badgeCount always (incl 0)
  → Android setNumber absolute
  → iOS setBadgeCount / APNS badge
  → Web NativeBadgeSync absolute Cap set
  → boot/resume: Cap cache may re-echo before Web
```

| Stage | Status |
|-------|--------|
| Absolute (no local +1) | LIVE primary path |
| Android Cap echo harness | Prior PASS (narrow) |
| iOS Cap follow server | **BREAK / PARTIAL** — resume Cap cache; Cap lag observed (8 vs 9) |
| Product Bell/list | Unaffected by this chain |

---

## Summary of first breaks (product FAIL)

| Symptom | First break chain |
|---------|-------------------|
| Bell digit > 0, list empty | A digit vs A list readers (unit/filter/refresh) |
| Popup shows 중요대화 | Popup is not A chain — intentional dual UX |
| App Icon ≫ Bell | Often B rooms — **not** a break if membership proves |
| iOS Cap ≠ server | Native refresh/Cap cache after App Icon truth |
| Ads into badge | Must stay NO_BADGE — not primary current FAIL |
