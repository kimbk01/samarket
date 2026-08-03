# Keep / Revert / Delete Symbol Map

**Mode:** PLAN ONLY — no revert executed  
**HEAD:** `f438f37e2`  
**Design:** KEEP product contract · REBUILD implementation layer

---

## Legend

| Tag | Meaning |
|-----|---------|
| KEEP | Remain as rebuild foundation (contract/identity/exclusion) |
| REVERT | Git revert (or equivalent file restore) in planned order before rebuild |
| DELETE_AFTER_REBUILD | Must not survive new SSOT; remove when R* lands (do **not** blind-revert if that revives pollution) |
| REFERENCE_ONLY | Docs/harness/PASS claims — evidence only, not product lock |
| MIGRATION_KEEP | Additive schema/RPC stays |
| MIGRATION_REVIEW | Keep schema; re-validate consumers after rollback |

---

## 1. Product contracts — KEEP

| Symbol / artifact | Path | Tag | Reason |
|-------------------|------|-----|--------|
| A/B/C classification table | `phase1-authority-contract.ts` | KEEP | Product contract |
| `classifyBadgeAuthority` | `badge-event-classifier.ts` | KEEP | Axis router |
| `memberBadgeIdentity` / `storeBadgeIdentity` | `badge-recipient-identity.ts` | KEEP | Member/store split |
| Count unit names | `badge-count-units.ts` | KEEP | message vs room vs notification |
| Surface eligibility helpers | `badge-surface-eligibility.ts` | KEEP | Eligibility matrix |
| Pure project* helpers (Phase1) | `phase1-authority-contract.ts` | KEEP | Formula shapes |
| `assertBStoreExcludedFromMemberSurfaces` | `store-communication-b-projection.ts` | KEEP | Exclusion intent |
| C Action Complete / forbid max dual | `store-operation-c-projection.ts` / `c-store-authority-contract.ts` | KEEP | C clear rule |
| Pure contract tests (2-1) | `slice2-1-*.test.ts`, `phase1-authority-contract.test.ts` | KEEP | Contract locks only |

---

## 2. A_member dual authority — DELETE_AFTER_REBUILD (not full Slice 2-2 git revert)

Blind `git revert d6dbb91d4` **revives** owner_intake Bell. Tag as rebuild replace.

| Symbol | Path | Tag | Authority effect |
|--------|------|-----|------------------|
| `deriveMemberUnreadNotificationCount` | `member-notification-a-projection.ts` | DELETE_AFTER_REBUILD | Digits = **attention keys** — forbidden as SSOT |
| `buildMemberNotificationAProjection.attentionKeys` | same | DELETE_AFTER_REBUILD | Key authority |
| `isMemberNotificationAListItem` / `filterMemberNotificationAInboxRows` | same | DELETE_AFTER_REBUILD | Parallel event-row authority |
| `isMemberNotificationAUnread` classifier gates | same | **KEEP intent** → rewrite under `AUnreadEventIds` | Exclusion of chat/owner_intake/marketing KEEP as **predicates** |
| Wire into HTTP total | `build-domain-badge-authority-http.ts` (`deriveMemberUnread…`) | DELETE_AFTER_REBUILD | Digit source |
| Bell total prefer A count | `build-notification-badge-projection.ts` / `apply-badge-count-authority-response.ts` | DELETE_AFTER_REBUILD | Dual apply path |
| List client filter | `MyNotificationsView.tsx`, `PhilifeHeaderNotificationInbox.tsx` | DELETE_AFTER_REBUILD | Different exclude/unit than digit |
| `resolveTier1HeaderBellBadgeTotal` (digit ignores list) | `tier1-header-inbox-sync.ts` | DELETE_AFTER_REBUILD | Split readers |
| `markMemberANotificationsAllRead` + legacy branch | `inbox-read-bridge.ts` | DELETE_AFTER_REBUILD | Dual-store mark-all |
| mark-all route body | `app/api/me/notifications/route.ts` (`1a814053b`) | DELETE_AFTER_REBUILD | Same dual bridge |
| Slice 2-2 docs claiming CODE/RUNTIME | `docs/.../slice2-2-*` | REFERENCE_ONLY | No auto-PASS |

**New SSOT (rebuild target, not yet coded):** `AUnreadEventIds(userId)` shared by digit, popup A, list, mark-all, delete, App Icon A.

---

## 3. Bell Popup 중요대화 — DELETE_AFTER_REBUILD

| Symbol | Path | Tag | Reason |
|--------|------|-----|--------|
| `important_room` builder | `CommunityMessengerHome.tsx` (~2302+) | DELETE_AFTER_REBUILD | Room/B mixed into Bell chrome |
| `importantCount` | same | DELETE_AFTER_REBUILD | Not A |
| `MessengerNotificationCenterItem` kind `important_room` | `messenger-notification-center-model.ts` | DELETE_AFTER_REBUILD | Model |
| Sheet render important | `MessengerNotificationCenterSheet.tsx` | DELETE_AFTER_REBUILD | UI |
| `CommunityMessengerBellPinnedAlerts` | components/... | DELETE_AFTER_REBUILD / move to chat chrome | Must not feed Bell A |

**Not in Slice commits** — native CM feature. Rollback = rebuild UI boundary, not git revert of 2-2.

---

## 4. B_member — KEEP direction · REBUILD membership export

| Symbol | Path | Tag | Reason |
|--------|------|-----|--------|
| `buildMemberCommunicationBProjection` | `member-communication-b-projection.ts` | KEEP (pure) + REBUILD consumers | Room sets + missed |
| `deriveMemberUnresolvedMissedCallCount` | same | KEEP | Missed in B |
| Owner room exclusion in App Icon | `build-notification-badge-projection.ts` (buyer-only SO for icon) | KEEP intent | Prevents baseline pollution |
| Room read reconcile | `f3dd1bb5d` (`room-unread-authority-rpc.ts`, `read-order-chat.ts`, CM service) | KEEP | Cursor clear |
| Total-only App Icon publish without ID sets | `domain-app-icon-badge.ts` / surface store | DELETE_AFTER_REBUILD | Must export membership IDs |
| Slice 2-3 RUNTIME PASS docs | docs | REFERENCE_ONLY | Harness ≠ product lock |

---

## 5. B_store — KEEP exclusion · REVIEW cache

| Symbol | Path | Tag | Reason |
|--------|------|-----|--------|
| `store-communication-b-projection.ts` | rebuild module | KEEP | Store-scoped rooms |
| `countOwnerStoreOrderMessengerUnreadForHubStore` | `store-order-chat-service.ts` | KEEP | Room unit |
| Hub/FAB wiring | `build-owner-hub-badge-payload.ts` | KEEP direction | Not member icon |
| Cache invalidate on read | `c78dd7a1e` `read-order-chat.ts` | MIGRATION_REVIEW / KEEP unless proven harmful | Stale mitigation |
| Cache-hit refresh | `c673ac444` `refresh-owner-hub-store-order-chat-unread-on-cache-hit.ts` | MIGRATION_REVIEW | Dual-path risk — review in R5 |

---

## 6. C_store — KEEP contract · MIGRATION_KEEP

| Symbol | Path | Tag | Reason |
|--------|------|-----|--------|
| `resolveCStoreOrderActionCount` etc. | `store-operation-c-projection.ts` | KEEP | Action Required |
| `c-store-authority-contract.ts` | rebuild module | KEEP | Clear ≠ read |
| Hub consumers | `build-owner-hub-badge-payload.ts`, FAB policy | KEEP | Ops surfaces |
| `get_owner_hub_store_attention_counts` + `cancel_pending_count` | migration `20261016120000_…` | MIGRATION_KEEP | Additive |
| `owner_intake` writers | `notify-store-commerce.ts` | DELETE_AFTER_REBUILD (writer route) | Residual dual — not C truth |
| Slice 2-5 RUNTIME PASS | docs | REFERENCE_ONLY | |

---

## 7. Native / FCM — REVERT wire + DELETE_AFTER_REBUILD Cap resume

| Symbol | Path | Tag | Reason |
|--------|------|-----|--------|
| `resolveMemberAppIconTotalForNativeFcm` | `native-fcm-member-app-icon-authority.ts` | REVERT (`e2cb00ec8`) | Total-only FCM wire |
| Always-send `badgeCount` | `fcm-data-payload-contract.ts` | REVERT (`e2cb00ec8`) | Part of 2-6 wire |
| Dispatcher / ack / campaign / read-order-chat FCM resolve | `notify-push-dispatcher.ts`, `domain-badge-read-ack.ts`, … | REVERT (`e2cb00ec8`) | Same wire |
| NativeBadgeSync / syncNativeBadgeCount | comments-only in e2cb | REVERT with commit (noop logic) | Clean tree |
| Test align | `f438f37e2` | REVERT with 2-6 | Follows e2cb |
| `applyFromCapBadgeCache` on resume | `AppDelegate.swift`, `MainActivity.java`, `DibayAppIconDeliveryAdapter.swift` | DELETE_AFTER_REBUILD | **Pre-dates 2-6** — not fixed by e2cb revert alone |
| Absolute Delivery Adapter setNumber | Android/iOS adapters | KEEP mode | Absolute OK; freshness order must change |

---

## 8. Importer dependency check (KEEP confirmation)

| KEEP candidate | Imported by dual-source? | Final KEEP? |
|----------------|--------------------------|-------------|
| `badge-event-classifier` | Used by A projection (to rebuild) | **YES KEEP** |
| `badge-recipient-identity` | Classifier / C contract | **YES KEEP** |
| `member-communication-b-projection` pure | HTTP builder / tests | **YES KEEP** pure; consumers REBUILD |
| `store-communication-b-projection` | Hub + tests | **YES KEEP** |
| `store-operation-c-projection` | Hub | **YES KEEP** |
| `member-notification-a-projection` as digit SSOT | HTTP + UI filters | **NO** — DELETE_AFTER_REBUILD as authority |

---

## 9. Summary counts (planning)

| Tag | Role |
|-----|------|
| KEEP | Contracts, identity, B/C pure projections, owner exclusion intent, absolute native mode |
| REVERT | Slice 2-6 commit pair (`e2cb00ec8`, `f438f37e2`) first |
| DELETE_AFTER_REBUILD | A dual digit/list, popup important, mark-all legacy, Cap resume authority, total-only App Icon |
| REFERENCE_ONLY | All Slice RUNTIME/LOCK docs |
| MIGRATION_KEEP | `20261016120000_c_store_attention_cancel_pending.sql` |
| MIGRATION_REVIEW | Pre-2-5 hub badge RPCs (compat) |
