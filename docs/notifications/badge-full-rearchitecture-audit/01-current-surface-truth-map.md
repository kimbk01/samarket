# 01 — Current Surface Truth Map

**Mode:** AUDIT ONLY · reverse from user-visible surfaces  
**HEAD:** `f438f37e2`

Observed product FAIL (input, not re-measured this turn): Samsung App Icon 23 / Bell 3 / list empty; popup mixes digit + 중요대화; iOS Cap≠server App Icon.

---

## Surface matrix

| Surface | Component | Digit reader | List reader | API | Projection | Origin | Identity | Filter | Unit | Cache | Refresh | Clear | Last major commit |
|---------|-----------|--------------|-------------|-----|------------|--------|----------|--------|------|-------|---------|-------|-------------------|
| Bell digit | `PhilifeHeaderNotificationInbox` / `Tier1NotificationAnchor` | `resolveTier1HeaderBellBadgeTotal` ← `notification-badge-count-store.total` | — | `GET /api/me/notifications/badge-count` | `deriveMemberUnreadNotificationCount` → `bellTotal` | `notification_events` unread | `user:{uid}` | A classifier; no chat/missed/owner_intake/marketing | **attention keys** | badge-count store | fetch/subscribe | mark A read | `d6dbb91d4` |
| Bell popup (messenger) | `MessengerNotificationCenterSheet` + `CommunityMessengerBellPinnedAlerts` | pinned total = invite+missed+**important** | local items from home | **No** `/api/me/notifications` | `CommunityMessengerHome` builds `important_room` | rooms / invites / calls | room / local | pin\|trade\|delivery + unread | **rooms** (cap 6) | messenger home state | home refresh | room read / invite handle | pre-slice + ongoing CM |
| Header inbox list | same Philife header | — | `fetchMeNotificationsListDeduped` + `filterMemberNotificationAInboxRows` | `GET /api/me/notifications` | A list predicate | `notification_events` | `user:{uid}` | exclude chat + owner commerce + A filter + pushKind | **event rows** (read+unread) | list dedupe cache | open/fetch | mark/delete IDs | `d6dbb91d4` |
| Full list `/my/notifications` | `MyNotificationsView` | — | same as header list | same | same | same | same | same + tabs 전체/배달/거래/공지 | event rows | same | same | mark-all A / delete_ids | `d6dbb91d4` |
| Notice/system detail | notification detail routes | n/a | single event | event/detail APIs | A row | `notification_events` | user | per id | 1 event | — | open | read | mixed |
| Bottom Chat | `BottomNav` / chat tab | `resolveMessengerChatTabBadgeCount` ← bottom projection | — | badge-count domain + optimistic | `projection.bottomChat` = GD+Group rooms | participants unread | user | GD+Group only | **rooms** | messenger-bottom store | domain apply / RT | room read | `06bab8001` |
| General/Group rows | CM home list | `unreadCount` on room | room list | CM bootstrap / RT | participant unread | participants | room | inbox-hidden filter | **messages** | local room state | RT/bootstrap | cursor | pre + 2-3 |
| Trade Hub | `MessengerPillarSummaryRow` trade | `hub.chatUnread` / `tradeHub` | trade rooms | domain projection | `projectMemberTradeHubBadge` | trade participants | user | trade rooms | **rooms** | hub store | domain apply | room read | `06bab8001` |
| Trade rows | trade room list | row unread | — | trade loaders | participant | room | — | **messages** | — | — | cursor | pre + 2-3 |
| Customer Order Hub | pillar delivery | `buyerOrderAttention` / customer rooms | SO rooms | domain | `storeOrderCustomerUnreadRooms` | SO participants buyer | user | buyer SO | **rooms** | hub | domain | room read | `06bab8001` |
| Customer Order rows | delivery rooms | row unread | — | SO loaders | participant | room | — | **messages** | — | — | cursor | pre + 2-3 |
| Owner Chat Hub/FAB | `MainBottomNavFabSector` / owner lite | `storeOrderChatUnread` active store | owner rooms | `GET` owner hub badge | `countOwnerStoreOrderMessengerUnreadForHubStore` | SO participants owner | **`store:{storeId}`** | active hub store | **rooms** | hub snapshot + memory | hub fetch / invalidate on read | owner room read | `5ee177ca6`+cache fixes |
| Owner Ops Hub/FAB | FAB orders/store | `orderAttention` / `inquiryAttention` | ops lists | hub badge + `get_owner_hub_store_attention_counts` | C projection | `store_orders` / `store_inquiries` | **`store:{storeId}`** | pending+refund+cancel (+inquiry) | **actions** | hub SWR / attention memory | hub fetch | **Action Complete** | `aa2d46b09` |
| Web Member App Icon | surface store | `domain-badge-surface-store.appIconTotal` | — | badge-count domain | `memberAppIconWebTotal` = A+B_member | events + participants + missed | user | exclude owner rooms/C | A keys + rooms + missed | surface snapshot | domain COMPLETE | A read / room read / missed seen | `06bab8001` |
| Android launcher | Delivery Adapter | Cap + `setNumber` | — | FCM `badgeCount` + Web sync | absolute MemberAppIconTotal | same as web total | device | — | total int | Cap prefs | boot/resume/push/Web | absolute 0 | `e2cb00ec8` (FCM always-send) |
| iOS launcher | Delivery Adapter / SpringBoard | Cap + `setBadgeCount` / APNS | — | same | absolute | same | device | — | total int | `capacitor.badge` UserDefaults; resume re-echo | boot/resume/push/Web | absolute 0 | `e2cb00ec8` + AppDelegate resume |
| FCM badge payload | push dispatcher | `resolveMemberAppIconTotalForNativeFcm` | — | push send | prefers `memberAppIconWebTotal` | server domain fetch | user | — | absolute int incl. 0 | — | each push | clear via 0 | `e2cb00ec8` |

---

## Structural findings (surfaces)

1. **Bell digit and full list share `notification_events` but not the same unit** (attention keys vs event rows; unread-only vs read+unread).
2. **Messenger Bell popup is not an A list** — important rooms / invites / missed are **B-adjacent local state**.
3. **Owner Chat / Ops** correctly store-scoped in Hub path; residual `owner_intake` user_id writers still exist (filtered from A, not removed).
4. **Native/FCM** intended absolute echo of Member App Icon; iOS resume can re-apply Cap cache before Web refresh.
