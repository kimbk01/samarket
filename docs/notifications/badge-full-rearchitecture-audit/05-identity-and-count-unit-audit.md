# 05 — Identity and Count Unit Audit

**Mode:** AUDIT ONLY

---

## Identity model

| Axis | Required identity | Live identity | Match? |
|------|-------------------|---------------|--------|
| A_member | `user:{userId}` | `notification_events.user_id` | **YES** |
| B_member rooms | member participant user | participants by uid | **YES** |
| B_store | `store:{storeId}` | Hub active store + owner partition | **YES** (Hub path) |
| C_store | `store:{storeId}` | RPC by `p_store_id` | **YES** |
| Residual owner_intake | should be store C | still **owner user_id** events | **NO** (filtered, not re-keyed) |

---

## Count units (must not share names)

| Unit | Used for | Violation risk |
|------|----------|----------------|
| `unreadMessageCount` | Room rows | OK |
| `unreadRoomCount` | Bottom / Hubs / App Icon B | OK when sets are unique |
| `unreadNotificationCount` | Bell — **implemented as attention keys** | Product said “notification 수”; key compression ≠ raw event count |
| `unresolvedMissedCallCount` | App Icon B | OK |
| `ownerActionRequiredCount` | C | OK |

---

## App Icon membership (required decomposition)

```text
AppIconTotal = |A IDs| + |member unread room IDs| + |unresolved missed call IDs|
```

| Member set | Must include | Must exclude |
|------------|--------------|--------------|
| A | unread A attention/events | owner_intake, chat, marketing, C |
| Rooms | GD, Group, Trade, Customer SO unread rooms | Owner SO rooms |
| Missed | unresolved call_ids / orphan | seen / completed |
| Never | C actions, ads FCM, B_store | — |

**Live Samsung 23 / Bell 3:**  
If A=3 and B rooms+missed=20 → formula-consistent.  
**Membership ID dump for that session: NOT re-fetched this audit** → composition **UNPROVEN live**, structure **PROVEN** in projection code.

---

## Clear-rule reclassification (product vs writers)

| Event | Should clear by | Live clear | Match? |
|-------|-----------------|------------|--------|
| Trade/order status A | Read/delete | A mark read / delete_ids | YES intent |
| GD/Group/Trade/Customer msg | Room cursor | participant read | YES |
| Owner chat | Owner room cursor | owner read + hub invalidate | YES intent |
| New order / refund / cancel | Action Complete | C RPC state | YES for Hub C |
| owner_intake event | Should not be A | Filtered from A; still written | PARTIAL |
| Marketing FCM | NO_BADGE | A excludes marketing types | YES intent |
| Missed call | Resolve/seen (B) | A excludes; B counts unresolved | YES intent |

**A/B/C clear-rule design matches product.** Writer residual (`owner_intake` on user_id) is implementation debt.
