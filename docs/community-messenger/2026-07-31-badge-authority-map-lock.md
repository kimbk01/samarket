# DIBAY Badge / Notification Authority Map — LOCK

**Product decision (2026-07-31):** Domain Badge Authority LOCK **유지**.  
숫자 강제 동등 금지. “일치” = 이벤트 귀속 · 표시 표면 · 확인 처리 · deep-link · App Icon `appIconTotal` 동기화.

**Baseline HEAD (start):** `90e7725a64e66c396ab9a2eab824839b146eb6e9`  
**Supersedes digit-equality goals.** Continues: `2026-07-24-badge-notification-domain-authority-lock.md` + Bell Contract B.

---

## 1. Locked surface units (do not unify into one number)

| Surface | Authority | Unit |
|---------|-----------|------|
| Header Bell | eligible unread `notification_events` (`bellTotal` / `badgeCountSnap.total`) | event count |
| App Icon / Push `badge_count` | Domain `appIconTotal` | unread rooms (GD+Group+Trade+SO buyer+SO owner) + orphan missed_call |
| Bottom Chat | Messenger projection = GD + Group unread **rooms** | room count |
| Trade Hub | Domain `trade` unread rooms | room count |
| Order Hub / FAB | customer `buyerOrderAttention` / owner store-scoped `storeOrderChatUnread` | room count (role-scoped) |
| List row | that room’s unread **message** count | message count |

Bell **must not** mirror App Icon. App Icon **must not** mirror Bell.

---

## 2. Canonical pipeline

```
Event / room unread fact
  → Domain (rooms.chat_domain + domain_identity_key) OR notification_events
  → Server loaders (targets + orphan missed + count_notification_events_badge)
  → buildNotificationBadgeProjection (single Builder)
  → Projection Authority commit (COMPLETE)
  → applyNotificationBadgeProjection
       → Bell store (events)
       → domain-badge-surface-store (appIconTotal) → NativeBadgeSync / FCM / APNS
       → Bottom Chat messenger projection (GD+Group rooms)
       → Owner hub axes (trade / buyer / owner aggregate; FAB store-scoped preserved)
  → UI / deep-link
```

---

## 3. Event registry policies (code SSOT)

Source: `lib/notifications/core/notification-event-registry.ts`  
Bell digit SUM: `mapBadgeRpc` in `notification-event-repository.ts`  
(**`admin_marketing_banner` counted in category field but excluded from `total`**)

| Event type | Domain | bellPolicy | appIconPolicy | Bell digit | App Icon | Bottom | Trade Hub | Order Hub | Row | Destination resolver |
|------------|--------|------------|---------------|------------|----------|--------|-----------|-----------|-----|----------------------|
| `chat_message` | general_direct | aggregate | domain_room_projection | **O** (event in total) | **O** (via room) | **O** | X | X | General row | `chat_room` |
| `group_message` | group | aggregate | domain_room_projection | **O** | **O** | **O** | X | X | Group row | `group_room` |
| `mention_message` / `pin_message` | group | include | domain_room_projection | **O** | **O** | **O** | X | X | Group row | `group_room` |
| `trade_message` | trade | aggregate | domain_room_projection | **O** | **O** | **X** | **O** | X | Trade row | `trade_room` |
| `store_order_message` | store_order | aggregate | domain_room_projection | **O** | **O** | **X** | X | **O** | Order row | `store_order_room` |
| `trade_status` | trade | include | exclude | **O** | **X** | X | X* | X | — | `display_route` |
| `order_status` / `delivery_status` | store_order | include | exclude | **O** | **X** | X | X | attention* | — | `display_route` |
| `community_activity` | community | include | exclude | **O** | **X** | X | X | X | — | `display_route` |
| `admin_notice` | admin | include | exclude | **O** | **X** | X | X | X | — | `display_route` |
| `admin_marketing_banner` | admin | **exclude** | exclude | **X** (banner feed only) | **X** | X | X | X | — | campaign `display_route` |
| `admin_test` | admin | exclude | exclude | **X** | **X** | X | X | X | — | inbox |
| `missed_call` | call | include | orphan_event_projection | **O** | **O** if `room_id` null; else via room path | domain of attached room | same | same | if room | `missed_call` |
| `incoming_call_signal` | call | exclude | exclude | **X** | **X** | X | X | X | — | Call Authority only |
| Friend request | Contact SSOT | — | — | **X** (retired from Bell inbox; legacy meta ignored) | **X** | X | X | X | — | Contact / friends UI (not Bell) |

\* Status events may drive order/trade attention targets separately from chat room hubs; App Icon excludes status SUM.

### Matrix (product-facing)

| Event | Bell | App Icon | Bottom Chat | Trade Hub | Order Hub | Row Badge | Destination |
|-------|-----:|---------:|------------:|----------:|----------:|----------:|-------------|
| General message | O (aggregate events) | O | O | X | X | General row msg | General room |
| Group message | O | O | O | X | X | Group row msg | Group room |
| Trade message | O | O | X | O | X | Trade row msg | Trade room |
| Order message | O | O | X | X | O | Order row msg | Order room |
| Friend request | **X** (Contact SSOT) | X | X | X | X | X | Friends management |
| Admin notice | O | X | X | X | X | X | Notice / deep link |
| Marketing campaign | **X** Bell digit; banner feed O | X | X | X | X | X | Campaign target |
| Missed call | O | O (orphan) / room path | if room domain | if trade room | if SO room | if room | Call / room |

---

## 4. Identity keys

| Domain | Identity |
|--------|----------|
| general_direct | canonical CM room (`chat_domain` + peer identity) |
| group | group room id |
| trade | trade_item + buyer + seller → room (`domain_identity_key`) |
| store_order | order + store + customer/owner role |

Trade/Order rooms **must not** appear in General/Group list kinds.

---

## 5. Read / ack / badge decrease

| Surface | Clear when | Must not clear |
|---------|------------|----------------|
| Bell | that `notification_events` row read_at / unread=false | opening Bell panel alone; other events |
| App Icon | domain room unread→0 and/or orphan missed cleared → recompute `appIconTotal` | Bell-only read of chat event without room read |
| Bottom Chat | that GD/Group room becomes unread=0 (room count −1) | home enter alone; trade/SO room read |
| Row | room read cursor commit | Bell event read alone |
| Trade Hub | that trade room unread=0 | Bottom / other trade rooms |
| Order Hub | that order room unread=0 in **same role context** | other role; Bottom; Trade |

Order: select → canonical destination → server read/ack → projection → surfaces → native badge.

---

## 6. Native / platform writers

| Path | Writer | Value |
|------|--------|-------|
| Push dispatch | `notify-push-dispatcher` → `fetchDomainBadgeAuthorityPayload({force:true})` | `appIconTotal` |
| Android tray | `DibayFirebaseMessagingService.setNumber(badgeCount)` | payload `badgeCount` |
| iOS APNS | `apns-sender-impl` `aps.badge` | `badge_count` / `badgeCount` |
| Foreground | `NativeBadgeSync` ← `domain-badge-surface-store.appIconTotal` → Capawesome `Badge.set` | `appIconTotal` |
| Logout | `clearNativeBadgeCount` + auth epoch reset | 0 |
| Web | no launcher badge | Bell/Bottom/Hub/UI only |

---

## 7. Cache / bootstrap / realtime

| Path | Behavior |
|------|----------|
| Boot | `ensureInitialBadgeSnapshotForBoot` owns first `badge-count` → COMPLETE |
| Server cache | 15s TTL; push/read paths `force` or `invalidateNotificationBadgeCache` |
| Client poll | dirty-gated 45s; clean ticks HTTP 0 |
| Realtime | CM room facts only after COMPLETE; generation / version gates |
| Auth epoch | logout bumps; prior in-flight discard |

---

## 8. Phase work status

| Phase | Status |
|-------|--------|
| 2 Authority Map | **DONE** — this document |
| 3 Conflict fixes | **CODE DONE** — atomic App Icon; Bottom Chat writer proof; deep-link trade/group align; auth epoch / stale facts |
| 4 SSOT reinforce | **CODE DONE** — contract tests / reintro bans (no new framework) |
| 5 Legacy | **INVENTORY DONE** — `2026-07-31-badge-authority-phase5-legacy-inventory.md` · DELETE 0 |
| 6 Runtime QA | **PLATFORM BLOCKED / RUNTIME PARTIAL** — `2026-07-31-badge-authority-phase6-qa-status.md` |
| 7 LOCK Product PASS | **NOT DECLARED** — awaiting Android/iOS/Web device QA |

**Frozen files** remain those listed in `2026-07-24-badge-notification-domain-authority-lock.md`, plus this map. Edits require product unlock except Phase 3–4 conflict fixes scoped here.

### Phase 7 reintro bans (enforced in contract tests)

- UI 직접 badge 합산 금지 (Bottom Chat → Messenger projection only)
- Bell에 appIconTotal / Native에 Bell total 금지
- Bottom Chat에 trade/store_order 포함 금지 (projection contract)
- shell/missedCall 분할 product publish 금지
- stale authEpoch / older factsVersion App Icon commit 금지
- logout 후 late async App Icon restore 금지
