# Badge Rollback Audit — Surface Source Map

**Mode:** AUDIT ONLY · same conceptual account `aaaa` (`11111111-1111-1111-1111-111111111111`)  
**Observed product FAIL example:** Samsung App Icon 23 / Bell 3 / list empty · iOS App Icon server 9 / Cap 8 / Bell UI 7 / list empty / popup 7+중요1

---

## 1. Server A_member

| Field | Value |
|-------|--------|
| Source | `buildDomainBadgeAuthorityHttpPayload` → `deriveMemberUnreadNotificationCount` / `member-notification-a-projection` |
| API | `/api/me/notifications/badge-count` → `memberUnreadNotificationCount`, `projection.bellTotal` |
| Unit | unread A-eligible **events** (attention keys) |
| Filter | A classifier; no chat_message; no owner store commerce (Slice 2-2 intent) |
| Identity | `user:{userId}` |
| Last major commit | `d6dbb91d4` (+ foundation `ca86a20c1`) |

---

## 2. Bell digit

| Field | Value |
|-------|--------|
| Source | `notification-badge-count-store` ← badge-count HTTP · Header via `resolveTier1HeaderBellBadgeTotal(badgeCountTotal)` |
| Files | `lib/notifications/tier1-header-inbox-sync.ts` · `lib/notifications/notification-badge-count-store.ts` |
| Formula | **digit = badgeCountTotal only** (store/row/list sync **ignored**) |
| Unit | same as Server A (intended) |
| Divergence risk | Digit can stay >0 while list returns [] if list filter/client filter/read state diverge from A explain rows |

---

## 3. Bell popup (메신저 알림 시트)

| Field | Value |
|-------|--------|
| Source | `MessengerNotificationCenterSheet` + `CommunityMessengerBellPinnedAlerts` |
| Formula | separate **messenger summary**: `importantCount`, group invites, missed — **not** Server A event list |
| i18n | `cm_ui_important_chat_count` (“중요 대화 {count}”) |
| Divergence risk | Popup “알림 7” may mirror Bell digit header, while “중요 대화 1” is **chat-pin/important path** — mixed UI, not pure A list |

---

## 4. Full notification list (`/my` 알림 · Header inbox list)

| Field | Value |
|-------|--------|
| Source | `GET /api/me/notifications` via `fetchMeNotificationsListDeduped` |
| UI | `MyNotificationsView.tsx` · Header inbox |
| Filters | `excludeChatMessages: true`, `excludeOwnerStoreCommerce: true`, `pushKind` tab (all/delivery/trade/notice) |
| Extra client filter | `filterMemberNotificationAInboxRows` |
| Mark-all | `mark_my_notifications_read_excluding_owner_and_chat` |
| Last major commit | `d6dbb91d4` |
| Divergence risk | **Digit uses badge-count A; list uses paginated inbox + pushKind + A row filter.** Empty list + digit>0 = identity/filter/cache break — **Slice 2-2 revalidation required** |

---

## 5. Server Member App Icon

| Field | Value |
|-------|--------|
| Source | `memberAppIconWebTotal` / `projection.appIconTotal` = **A_member + B_member** (rooms + unresolved missed) |
| Files | `member-communication-b-projection.ts` · `build-notification-badge-projection.ts` |
| Excludes | B_store owner rooms · C_store |
| Last major commit | `06bab8001` (+ read fix `f3dd1bb5d`) |
| Note | Bell digit **≠** App Icon by contract when B_member > 0 (e.g. Bell 7 / App Icon 8) |

---

## 6. Native App Icon (Android launcher / iOS Cap·lastApplied)

| Field | Value |
|-------|--------|
| Source | `NativeBadgeSync` ← `domain-badge-surface-store.appIconTotal` → `syncNativeBadgeCount` → Cap / Delivery Adapter |
| FCM wire | `notify-push-dispatcher` → `resolveMemberAppIconTotalForNativeFcm` (`e2cb00ec8`) |
| Slice 2-6 Native Web path | **comment-only** on sync files — logic still absolute set of surface total |
| Divergence risk | Cap lag/stale vs server App Icon; FCM vs Web sync paths differ |

---

## 7. B_store / C_store (context)

| Axis | Surface | Member Bell/App Icon |
|------|---------|----------------------|
| B_store | Owner hub chat / FAB | **excluded** from Member App Icon (`5ee177ca6`) |
| C_store | Owner ops Hub C | **excluded** (`aa2d46b09`) |

---

## Same-time product observations (reported / prior runtime)

| Surface | Samsung (owner/buyer session report) | iOS `@aaaa` (prior runtime) | Source class |
|---------|--------------------------------------|-----------------------------|--------------|
| Server A_member | (not captured same-shot in this audit) | ~8 (server) | badge-count A |
| Bell digit | **3** | **7** | badgeCountTotal |
| Bell popup items | enter → empty list context | **7** + 중요 대화 **1** | digit + messenger important |
| `/my/notifications` list | **empty** | **empty** | inbox API + filters |
| Server B_member | (not same-shot) | App Icon 9 ⇒ B≈1 if A=8 | B projection |
| MemberAppIconTotal | **23** (launcher report) | server **9** | A+B |
| Android launcher | **23** | n/a | Delivery / FCM / Cap echo |
| iOS Cap / lastApplied | n/a | Cap **8** / lastApplied matched Cap once | NativeBadgeSync |
| B_store / C_store | owner hub separate | excluded from member icon | Slice 2-4/2-5 |

**Audit note:** Live same-API JSON dump for all rows was **not re-fetched in this audit turn** (no patch / no deploy / no device drive). Numbers above are **prior product observations** used only to classify commit causality. Source wiring is from code + git.

## Same-time mismatch interpretation (evidence-based)

| Observation | Interpretation |
|-------------|----------------|
| Bell 3 / App Icon 23 (Samsung) | **Expected if B_member large** — not proof Slice 2-6 broke Bell |
| Bell 3 / list empty | **FAIL** — digit↔list identity — **not** e2cb00ec8 |
| Popup 7 + 중요대화 1 / list empty | Popup mixes digit + messenger important — **not** single A list |
| iOS Cap 8 / server App Icon 9 | Native refresh lag/stale — **not explained by e2cb NativeBadgeSync logic** (comments only) |
