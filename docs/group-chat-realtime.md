# 그룹 채팅 Realtime 구독 (검증 체크리스트)

Supabase Realtime `postgres_changes` + RLS. 클라이언트 훅 패턴은 [lib/chats/use-chat-room-realtime.ts](../lib/chats/use-chat-room-realtime.ts) 와 동일(부트스트랩 성공 후 `enabled`).

---

## 1. 구독 전략 (100+ 기본)

| 항목 | 정책 |
|------|------|
| 채널 수 | **방당 1개** — `postgres_changes` on `group_messages` |
| 필터 | `room_id = eq.<uuid>` |
| 금지 | 멤버 1인당 별도 채널, “N명에게 N번” 개별 이벤트 |
| 타이핑 | DB row 폭주 방지 — **Broadcast** 토픽 또는 별도 경량 채널 ([group-chat-presence-typing.md](./group-chat-presence-typing.md)) |

---

## 2. Supabase Database Replication

- `supabase_realtime` publication에 **`group_messages`** 포함 ([`20260613120000_group_messages_realtime_publication.sql`](../supabase/migrations/20260613120000_group_messages_realtime_publication.sql) 또는 대시보드에서 동일 작업).
- `group_room_members` 는 **일반적으로 구독 제외** — 읽음·멤버 변경은 HTTP 또는 배치로 동기화해 이벤트 폭주 방지.

---

## 3. RLS (개요)

- `group_messages` SELECT: `EXISTS (SELECT 1 FROM group_room_members m WHERE m.room_id = group_messages.room_id AND m.user_id = auth.uid() AND m.left_at IS NULL)`.
- INSERT: 활성 멤버만, 필요 시 역할별 제한.
- UPDATE/DELETE: 발신자 또는 moderator/owner (정책에 따라).

운영 배포 전: 스테이징에서 **동일 필터로** `postgres_changes` 이벤트가 중복·누락 없는지 확인.

---

## 4. 폴링 백업

- Realtime `SUBSCRIBED` 아님 / 재연결 실패 시에만 **긴 간격**(예: 60–180s) `GET .../messages?after=` 증분.
- 정상 시 폴링으로 메인 스트림 대체하지 않음.

---

## 5. 클라이언트 중복 방지

- `message.id` 기준 dedupe.
- 부트스트랩 직후 Realtime 이 동일 id 를 보내면 무시.
