# CM Room — Entry Scroll Contract (Layout Settle Gate)

> **정본:** `docs/community-messenger-mobile-room-viewport.md` (keyboard/layout LOCK)  
> **검증:** `npm run verify:cm-room-entry-scroll-contract`  
> **구현 SSOT:** `messenger-room-entry-scroll-settle.ts` · `messenger-room-entry-scroll-owner.ts` · `messenger-room-scroll-anchor-controller.ts`

---

## §0 불변조건 (제품)

1. **일반 CM 방 진입** — bootstrap window(최대 30건) + **tail bottom**. 전체 older history 는 상단 scroll paging (`use-messenger-room-eager-older-history-hydration` — 주문·배달만 eager).
2. **Tail 위치** — 마지막 말풍선은 composer 위 **8px** (`CM_ROOM_TAIL_COMPOSER_GAP_DEFAULT_PX`).
3. **과거 읽기** — prepend 시 화면 anchor 유지 (`restoreMessengerRoomPrependScrollAnchor`). prepend fetch 중 chrome keep-bottom **금지**.
4. **Push/deeplink 진입** — persisted scroll 무시, latest bottom + tail settle.

---

## §1 Layout Settle Gate (근본 계약)

| 상태 | 의미 | 허용 |
|------|------|------|
| `entryInitialScrollDone` | 1차 bottom scroll 완료 | `entry_tail_settle` / `push_entry_tail_settle` |
| `entryScrollSettled` | composer synced + terminal tail | `virtualizer_scroll_anchor` · `viewport/composer/keyboard keep-bottom` |

**Gate 분리:** tail settle → `entryInitialScrollDone` 필요. chrome resize keep-bottom → **`entryScrollSettled` 필요** (1차 scroll 직후 composer RO 가 tail 을 덮어쓰지 않음).

**DO NOT:** `initial_load` 직후 `entryScrollSettled = true` — composer·visible viewport·virtual 전환 전 virtual/layout scroll 이 tail 을 덮어씀.

**Terminal settle:** `resolveMessengerRoomEntryScrollFinalize` — composer 미동기 시 `pendingTailSettle` → `CM_ROOM_CHROME_HEIGHT_SYNC_EVENT` → tail settle → `entryScrollSettled`.

---

## §2 Scroll owner whitelist

| reason | scrollTop 변경 | settle |
|--------|----------------|--------|
| `initial_load` / `push_entry_initial_load` | ✅ | initial only |
| `entry_tail_settle` / `push_entry_tail_settle` | ✅ force | **terminal settled** |
| `room_entry_restore` | ✅ persisted | bottom→defer, mid-history→즉시 settled |
| `timeline_delivery_direct_paint` | ✅ (store-order defer path) | 동일 gate |
| `prepend_older_preserve_position` | ❌ (fetch hook) | — |
| `composer_resize_keep_bottom` | near-bottom only | **settled 후** |

**금지:** Timeline/Phase2Body/Composer 에 `scrollTop`/`scrollTo` 직접 호출 (delivery direct → `scheduleMessengerScrollToBottomAfterRowsPainted` → controller 경유만).

---

## §3 수정 전 체크리스트

- [ ] `resolveMessengerRoomEntryScrollFinalize` 경유 없이 `markMessengerRoomEntryScrollSettled` 호출 추가하지 않았는가?
- [ ] keyboard/viewport PR 과 scroll-anchor PR 을 **동시에** 넣지 않았는가?
- [ ] prepend 중 `loadingOlderMessages` keep-bottom 차단 유지되는가?
- [ ] `npm run verify:cm-room-entry-scroll-contract` PASS

---

## §4 변경 이력

| 날짜 | 요약 |
|------|------|
| 2026-06-20 | Layout Settle Gate — `entryInitialScrollDone` / terminal tail settle, prepend keep-bottom 차단, 그룹 채팅 entry scroll, verify 스크립트 |

**규칙:** entry scroll·settle 계약 변경 시 이 표 + `docs/community-messenger-mobile-room-viewport.md` §7 에 한 줄 추가.
