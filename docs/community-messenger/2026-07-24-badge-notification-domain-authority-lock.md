# Badge / Notification Domain Authority — LOCK

**판정:** `PASS — BADGE / NOTIFICATION DOMAIN AUTHORITY LOCKED`  
**전체 메신저:** `PASS — TRADE LIST PRODUCTION VERIFIED / FOUR-DOMAIN INFRASTRUCTURE PENDING`  
**Lock date:** 2026-07-24  
**Bell Contract B unlock:** 2026-07-25 (explicit product approval — Bell = approved events only)  
**Evidence baseline:** `ada4104aa` + Phase-1 evidence (Group 3/3, SO dual-role / Trade race classified)

---

## Locked SSOT path (변경 금지 — structure)

```
rooms.chat_domain + rooms.domain_identity_key
  → notification_targets Domain snapshot (upsert_notification_target_unread)
  → Domain loaders (fail-closed on NULL / mismatch)
  → buildNotificationBadgeProjection
  → Header Bell / App Icon(독립) / Bottom(GD+group) / Hubs
```

### Frozen surfaces (2026-07-25 Contract B)

| Surface | Rule |
|---------|------|
| Header Bell | `bellTotal = unreadApprovedNotificationEvents` (eligible unread `notification_events`) · **Domain room sum 금지** · adminNotice supplement 재가산 금지 |
| App Icon | Domain App Icon projection · **Bell mirror 금지** · GD+group+trade+customer SO+owner SO+orphan |
| Bottom Chat | **general_direct + group unread 방 수만** · trade/SO customer/owner 제외 |
| Customer order | `storeOrderCustomerUnreadRooms` / `buyerOrderAttention` only |
| Owner order FAB | store-scoped `storeOrderChatUnread` (`fab_owner_order_chat` + storeId) · Domain apply **must not overwrite** with global owner |
| Owner aggregate | `storeOrderOwnerUnreadRooms` (all stores) · App Icon / all-stores hub |
| Target writer | room authority pair only · peer/direct_key/`general_direct` default 금지 |
| Snapshot fill | NULL-pair only · non-NULL overwrite 금지 · partial COALESCE 금지 |
| Non-room targets | Domain 미기입 허용 · Domain loader 집계 제외 |

### Frozen files (edit requires explicit unlock approval)

- `supabase/migrations/20261008120000_notification_targets_domain_snapshot.sql` (behavior contract)
- `lib/notifications/notification-targets.ts`
- `lib/notifications/notification-target-messenger-bridge.ts`
- `lib/notifications/notification-target-domain-snapshot.ts`
- `lib/notifications/build-notification-badge-projection.ts`
- `lib/notifications/pipeline/build-domain-badge-authority-http.ts`
- `lib/notifications/apply-badge-count-authority-response.ts` / `applyNotificationBadgeProjection` funnel
- `lib/notifications/tier1-header-inbox-sync.ts` (`resolveTier1HeaderBellBadgeTotal`)
- Bottom: `get_community_messenger_unread_room_count` B3 domain filter + `bottom-chat-live-room-count`
- App Icon: `app-icon-badge-projection` / `NativeBadgeSync` (no bell_mirror)

---

## Residual trackers (do NOT reopen LOCK)

| ID | Item | Classification |
|----|------|----------------|
| R-SO-DUAL | Store Order buyer_order + owner_order_chat dual attention | Dual-role target semantics / test-account overlap |
| R-TRADE-MULTI | Multi-trade unread + room-read `cleared:0` sampling | Harness / clear-scope; not snapshot miss |

---

## Phase J entry

LOCK 이후만 Legacy 제거. 순서 고정:

1. Inventory
2. Quarantine
3. 제품 호출 0 증명
4. import-ban / lock test
5. 실삭제
6. 정적 Gate
7. 2기기 회귀 QA

**진행:**
- J1–J4 — all PASS (J4 승인)
- Residual review — 삭제 대상 0 · 즉시 삭제 금지로 분류 (`2026-07-24-badge-bell-phase-j-residual-review.md`)
- **Phase J LOCK — 보류** (2기기 QA + 명시 승인)
- **Bell Contract B** — 2026-07-25 product unlock (room-sum Bell → approved events)
- **2026-07-31** — Product decision: LOCK 유지 (숫자 강제 동등 금지). Authority Map: `2026-07-31-badge-authority-map-lock.md`. Phase 3-1 atomic App Icon complete publish. Product PASS 미선언 (device QA PENDING).

**실삭제·공식 변경은 슬라이스별 승인 전 금지** (Bell B 제외 — 승인됨).
