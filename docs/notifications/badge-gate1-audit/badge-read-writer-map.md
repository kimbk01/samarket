# Gate 1 — Read / Delete Writer Map

**Mode:** AUDIT ONLY · HEAD `f438f37e2`

**Dual store (PROVEN):** Bell mutations often touch legacy `notifications` **and** `notification_events`. List GET SSOT = events.

---

## 표

| 사용자 동작 | 호출 함수/API | 변경 데이터 | 영향 표면 | 문제 (증거) |
|-------------|---------------|-------------|-----------|-------------|
| Bell 항목 클릭/읽음 | `PATCH /api/me/notifications` `{ids}` → `patchInboxNotificationIdsRead` → `markNotificationRead` / thread | events read + legacy `is_read` + targets clear | Bell list · digit(resync) · App Icon | 명령서: 읽음 확정 후 route. thread clear가 room-scoped까지 건드릴 수 있음 |
| Bell 모두 읽음 | `{ mark_my_notifications_read_excluding_owner_and_chat: true }` → `markMemberANotificationsAllRead` | **legacy A 필터 업데이트 + 독립적으로 events A mark** | Bell · App Icon A | **Dual-store PROVEN** · digit=keys / list=events 단위 불일치 · My페이지는 header와 달리 resync 누락 가능 |
| Bell 항목 삭제 | `PATCH { delete_ids }` → read 후 dismiss/delete | events dismiss · legacy DELETE | list · A if unread | **전체 삭제 API 없음 PROVEN** (per-ids only, cap 200) |
| Bell 전체 삭제 | — | — | — | **제품 API UNPROVEN / 없음** |
| CM 방 진입 읽음 | `PATCH …/community-messenger/rooms/{id}` mark_read → `dibay_mark_room_read_atomic` + `postNotificationRoomReadWithAck` | participant unread 0 · events room clear | Bottom/Trade/Customer · App Icon B · row | visibility/dwell 게이트 · 명령서 최소조건과 부분 정합 |
| CM 홈 mark read | `CommunityMessengerHome.markRoomRead` | participant unread | hubs/App Icon | **`postNotificationRoomRead` 미호출 gap PROVEN** → events 잔존 가능 |
| Trade (CM) | 동일 CM mark_read | 동일 | Trade hub | — |
| Trade legacy `ChatRoomScreen` | `postNotificationThreadRead` | events/targets only | Trade/Bell | CM atomic과 **이중 스택** |
| Customer/Owner order chat 진입 | `POST …/read-order-chat` → `readOrderChat` → atomic store_order | unread 0 · targets · events · owner hub invalidate | Customer hub · Owner chat FAB · App Icon (owner room 정책) | C ops와 분리 PROVEN |
| FCM 탭 (보존형) | `PushRouteListener` → `postNotificationEventOpenedRead` | single event read + Domain ACK | Bell/App Icon | 일부 call accept는 opened-read skip |
| FCM 탭 (채팅) | navigate only → 방 mount 후 mark_read | room cursor | B surfaces | 탭만으로 0 만들지 않음 — 명령서와 **정합** |
| Owner 주문 ack | `postNotificationThreadRead(order…)` | order-scoped events | Bell if owner_intake still visible | **C 감소 아님** — C는 order status 변경 |
| Owner C 감소 | accept/reject/cancel/inquiry close APIs | `store_orders` / `store_inquiries` | Owner Ops FAB | 읽음≠C · **PROVEN 의도** |
| FG/BG/resume | badge-count poll · RT bridge · **Native Cap re-echo** | Cap prefs / launcher **DB 아님** | App Icon | resume **stale Cap 권위화 PROVEN** (`applyFromCapBadgeCache`) |
| Cold boot Web | `ensureInitialBadgeSnapshotForBoot` → badge-count | client stores | Bell/App Icon | — |

---

## 명령서 §5 대비

| 규칙 | 코드 |
|------|------|
| 항목 열기: read 확정 → 목록 → A → App Icon → route | 부분 구현 · fire-and-forget/route-first 위험 경로 존재 |
| 모두 읽음: A=0, 목록 유지 | mark-all은 read · 삭제 아님 — 정합 · **dual table** 문제 |
| 전체 삭제 | **미구현** |
| 채팅: viewport+ACK 후 단일 commit으로 전 표면 | atomic + 다수 client 경로 · 홈 mark와 room-open **불일치** |
| FCM ≠ 읽음 권위 | 대체로 정합 |
| Owner push ≠ member Bell | owner_intake 이벤트가 user_id에 남아 filter로 막는 구조 |

---

## Dual-store (반복 금지용 한 줄)

```text
markMemberANotificationsAllRead
  → notifications (legacy) UPDATE
  → notification_events A mark (always)
```

파일: `lib/notifications/inbox-read-bridge.ts`
