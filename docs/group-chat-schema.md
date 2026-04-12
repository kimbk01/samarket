# 그룹 채팅 스키마 초안 (100+ 멤버)

**축 분리 결정:** 거래·1:1 통합 방은 기존 `chat_rooms` / `chat_messages` / `chat_room_participants` 축을 유지한다. **그룹(다자, 100+)** 은 별도 테이블 접두 `group_*` 로 두어 RLS·인덱스·Realtime publication 을 독립 튜닝한다. 한 테이블에 `room_kind` 로 합치는 방식은 인덱스·쿼리 패턴이 충돌하므로 **권장하지 않는다**.

---

## 1. 핵심 테이블

### `group_rooms`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `title` | text | |
| `created_by` | uuid | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_message_id` | uuid nullable FK → `group_messages.id` | 비정규화 미리보기 |
| `last_message_at` | timestamptz nullable | |
| `last_message_preview` | text nullable | 길이 제한(예: 120자) |
| `message_seq` | bigint NOT NULL DEFAULT 0 | 방 단위 단조 증가 — unread O(1) 차이 계산용 |
| `member_count` | int | 비정규화(트리거/큐) |
| `settings` | jsonb | 느린 모드, 초대 링크 등 |

인덱스: `(last_message_at DESC)` 목록 정렬; 필요 시 `(id)` PK 만으로 충분.

### `group_room_members`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `room_id` | uuid FK | |
| `user_id` | uuid | |
| `role` | text | `owner` \| `moderator` \| `member` |
| `joined_at` | timestamptz | |
| `left_at` | timestamptz nullable | 소프트 리브 |
| `muted_until` | timestamptz nullable | |
| `last_read_message_id` | uuid nullable | 키셋 읽음 |
| `last_read_seq` | bigint | `group_rooms.message_seq` 와 비교해 unread = `max(0, room.message_seq - last_read_seq)` |
| `notification_muted` | boolean | |
| `updated_at` | timestamptz | |

유니크: `(room_id, user_id)` WHERE `left_at IS NULL`.

인덱스: `(room_id)` 활성 멤버; `(user_id, room_id)` 내 방 목록.

**대안(소규모만):** `unread_count` 증감 컬럼 — 100+ 에서는 **시퀀스 차이**가 쓰기·일관성 면에서 유리.

### `group_messages`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `room_id` | uuid FK | |
| `sender_id` | uuid | |
| `message_type` | text | |
| `body` | text | |
| `metadata` | jsonb | |
| `created_at` | timestamptz NOT NULL | |
| `seq` | bigint NOT NULL | 방 내 단조 — `group_rooms.message_seq` 와 동기(삽입 시 동일 트랜잭션에서 증가) |
| `deleted_at` | timestamptz nullable | 소프트 삭제 |
| `hidden_by_moderator` | boolean | |

인덱스: `(room_id, created_at DESC, id DESC)` 키셋 페이지네이션.

삽입 시: `group_rooms.message_seq` (또는 `max(seq)+1`) 갱신 + `last_message_*` 비정규화.

### `group_audit_log` (관리·모더레이션)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | bigint PK | |
| `room_id` | uuid | |
| `actor_id` | uuid | |
| `action` | text | kick, hide_message, pin, … |
| `target_id` | uuid nullable | 메시지/유저 |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |

---

## 2. 마이그레이션 시 주의

- `message_seq` / `seq` 는 **동일 트랜잭션**에서 부여해 건너뛰기 없이 단조 보장.
- 아카이브·파티션은 [messenger-db-archive-roadmap.md](./messenger-db-archive-roadmap.md) 와 동일 원칙.

---

## 3. 기존 `chat_*` 와의 관계

- 데이터 이중 쓰기 금지: 그룹 메시지는 `group_messages` 만.
- 제품 내 링크·딥링크는 `room_id` 네임스페이스로 구분 (`group:` vs 기존 UUID 규칙 문서화).
