# Commit → Surface Impact (dependency evidence)

**HEAD:** `f438f37e2`  
**Method:** `git show --name-only` + importer grep · not product observation  
**Evidence grades:** PROVEN · ABSENT · UNRELATED · UNPROVEN_LIVE

---

## Matrix (Slice rebuild commits)

| Commit | Bell digit | Bell list | Popup 중요대화 | Owner Hub | Member App Icon formula | FCM badge wire | Cap resume |
|--------|------------|-----------|----------------|-----------|-------------------------|----------------|------------|
| `ca86a20c1` 2-1 | ABSENT files | ABSENT | ABSENT | ABSENT | contracts only | ABSENT | ABSENT |
| `d6dbb91d4` 2-2 | **PROVEN** | **PROVEN** | ABSENT | ABSENT | bellTotal wire | ABSENT | ABSENT |
| `1a814053b` | mark-all path **PROVEN** | mark-all **PROVEN** | ABSENT | ABSENT | ABSENT | ABSENT | ABSENT |
| `06bab8001` 2-3 | ABSENT UI | ABSENT UI | ABSENT | ABSENT | **PROVEN** B+A icon | ABSENT | ABSENT |
| `f3dd1bb5d` | ABSENT | ABSENT | ABSENT | read-order side | room clear **PROVEN** | ABSENT | ABSENT |
| `5ee177ca6` 2-4 | ABSENT | ABSENT | ABSENT | **PROVEN** | exclusion tests | ABSENT | ABSENT |
| `c78dd7a1e`/`c673ac444` | ABSENT | ABSENT | ABSENT | **PROVEN** cache | ABSENT | ABSENT | ABSENT |
| `aa2d46b09` 2-5 | ABSENT | ABSENT | ABSENT | **PROVEN** C | ABSENT | ABSENT | ABSENT |
| `e2cb00ec8` 2-6 | **ABSENT** | **ABSENT** | **ABSENT** | ABSENT Hub | reads existing total for FCM | **PROVEN** | **ABSENT** (not in commit) |
| `f438f37e2` | ABSENT | ABSENT | ABSENT | ABSENT | ABSENT | tests/identity **PROVEN** | ABSENT |

---

## `e2cb00ec8` file list (complete)

```
components/push/NativeBadgeSync.tsx          # comment-only (git show)
lib/push/native/sync-native-badge-count.ts   # comment-only
lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority.ts
lib/notifications/pipeline/notify-push-dispatcher.ts
lib/notifications/pipeline/domain-badge-read-ack.ts
lib/order-domain/read-order-chat.ts          # FCM resolve call
lib/admin/notification-campaigns/campaign-send-user.ts
lib/push/dispatch/fcm-data-payload-contract.ts  # always-send badgeCount
+ tests/docs
```

**Intersection with `d6dbb91d4` file set:** empty (`comm -12` → no lines).

**Not in e2cb:**  
`PhilifeHeaderNotificationInbox.tsx`, `MyNotificationsView.tsx`, `CommunityMessengerHome.tsx`, `MessengerNotificationCenterSheet.tsx`, `member-notification-a-projection.ts`, `tier1-header-inbox-sync.ts`, `AppDelegate.swift`, `DibayAppIconDeliveryAdapter.swift`.

### Conclusion for P0

| Claim | Grade |
|-------|-------|
| e2cb changed FCM badge encoding | **PROVEN** |
| e2cb changed Bell digit/list/popup code | **ABSENT / contradicted** |
| Reverting e2cb+f438 fixes Bell 3 / empty list | **UNPROVEN** (no code path) |
| Cap resume stale caused by e2cb | **CONTRADICTED** — `applyFromCapBadgeCache` introduced `5e7c46f9f`, ancestor of e2cb (`merge-base --is-ancestor` exit 0) |

→ **P0 as fix for Bell/Popup/목록: evidence fails.**  
P0 only justified if goal is “undo FCM always-send wire” as a **narrow FCM experiment**, not product Bell repair.

---

## `d6dbb91d4` — Bell surfaces (PROVEN)

Files include:

- `member-notification-a-projection.ts`
- `PhilifeHeaderNotificationInbox.tsx`, `MyNotificationsView.tsx`
- `build-domain-badge-authority-http.ts`, `apply-badge-count-authority-response.ts`
- `inbox-read-bridge.ts`, `resolve-tier1-bell-surface.ts`

| Surface | Impact |
|---------|--------|
| Bell digit | Introduces A `memberUnreadNotificationCount` → total |
| List | exclude flags + A filter wiring |
| mark-all | A path (extended by `1a814053b`) |
| Popup 중요대화 | **not in this commit** |

---

## Popup 중요대화 — outside Slice ladder (PROVEN)

| Fact | Evidence |
|------|----------|
| Symbol | `important_room` / `importantCount` in `CommunityMessengerHome.tsx` |
| Introduced | `8d2b16ca1` (ancestor of baseline `1e2a560c1`) |
| Commits `1e2a560c1..HEAD` touching that file | **none** in git log |

→ Badge Slice 2-2…2-6 **did not introduce** popup chat mix. Treating popup as Slice REVERT target is **invalid**.

---

## Cap resume — outside Slice 2-6 (PROVEN)

| Fact | Evidence |
|------|----------|
| Call site | `AppDelegate.swift` → `applyFromCapBadgeCache()` |
| Introduced | `5e7c46f9f` |
| In e2cb? | **No** |
| Before e2cb? | **Yes** |

→ “REVERT e2cb to fix Cap resume authority” is **false**.
