# Surface ID-Set Comparison (code-proven)

**Question:** Do Bell digit, Popup, full list, mark-all, App Icon A use the **same event ID set**?  
**Live dump this turn:** **NOT RUN** → equality on a device account = UNPROVEN_LIVE  
**Structural sameness:** answerable from code.

---

## Definitions (from code)

| Set name | How built | ID kind |
|----------|-----------|---------|
| `DigitKeySet` | `buildMemberNotificationAProjection` → `attentionKeys` · count = `attentionKeys.length` | attention **keys** (not event ids) |
| `DigitEventIds` | same projection → `eventIds` array | event ids · **not used for digit UI count** |
| `ListRowSet` | `GET /api/me/notifications` → excludes → `filterMemberNotificationAInboxRows` | event row ids · **read + unread** |
| `PopupImportantSet` | `CommunityMessengerHome` filter rooms → `important:{roomId}` | **room** ids |
| `PopupInvite/Missed` | local stores / call log | non-A |
| `MarkAllLegacyIds` | `notifications` table unread, exclude chat/owner commerce | legacy ids |
| `MarkAllEventIds` | `markNonChatNonOwnerNotificationEventsRead` + `isMemberNotificationAUnread` | event ids unread A |
| `AppIconA` | same count path as digit (`memberUnreadNotificationCount`) | key **count** into total · **no ID set exported to Native** |

---

## Pairwise equality

| Pair | Same ID kind? | Same membership function? | Code grade |
|------|---------------|---------------------------|------------|
| DigitKeySet ↔ ListRowSet | **NO** (keys vs events) | **NO** (unread-only keys vs read+unread rows; list also pushKind) | **PROVEN unequal structure** |
| DigitEventIds ↔ ListRowSet unread | Same table | Overlap possible; list includes read; digit events only unread A | **PROVEN not identical predicates** |
| Digit* ↔ PopupImportantSet | **NO** | **NO** | **PROVEN disjoint sources** |
| DigitKeySet ↔ MarkAllEventIds | keys vs events | related via `isMemberNotificationAUnread` | **PROVEN different units** |
| MarkAllLegacyIds ↔ MarkAllEventIds | dual tables | parallel | **PROVEN dual-store** |
| Digit ↔ App Icon A contribution | same count input | no separate ID export | **PROVEN count shared; set not shipped** |

### Digit count line (PROVEN)

```163:165:lib/notifications/badge-authority-rebuild/member-notification-a-projection.ts
    memberUnreadNotificationCount: attentionKeys.length,
    attentionKeys,
    eventIds,
```

### Digit UI ignores list (PROVEN)

```21:29:lib/notifications/tier1-header-inbox-sync.ts
}): number {
  void opts.surface;
  void opts.storeUnread;
  void opts.rowUnread;
  void opts.listSynced;
  // ...
  return Math.max(0, Math.floor(Number(opts.badgeCountTotal) || 0));
}
```

### Mark-all dual (PROVEN)

`markMemberANotificationsAllRead`: updates `notifications` **and** always runs `markNonChatNonOwnerNotificationEventsRead` on `notification_events` (`inbox-read-bridge.ts` ~497–562).

### Popup not on `/api/me/notifications` (PROVEN)

`important_room` built from `baseChatListItems` in `CommunityMessengerHome.tsx` (~2302+); IDs `important:${room.id}`.

---

## Product requirement vs code

| Product intent | Code reality |
|----------------|--------------|
| One A unread ID set for digit/popup/list/mark-all | **Not implemented** — PROVEN structural fracture |
| Popup shows A notifications | Popup shows rooms/invites/missed — PROVEN |

---

## What is still UNPROVEN_LIVE

Same account, same moment:

- concrete `DigitEventIds` vs visible list unread ids  
- why list empty while digit > 0 (filter miss vs cache vs pagination vs empty page)

Structure already proves they **can** diverge; live dump needed to pin **which** mechanism on FAIL accounts.
