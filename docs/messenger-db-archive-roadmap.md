# 메시지 저장소 — 핫/아카이브 · 인덱스 · 파티션 로드맵 (Supabase/Postgres)

## 통합 거래 채팅 (`chat_messages` / `chat_rooms`)

- 목록·페이지: `GET …/messages` 는 `ORDER BY created_at DESC, id DESC` + `before` 키셋을 `(created_at, id)` 복합 비교로 처리(동일 시각 타이브레이크 누락 방지). 클라이언트는 `before`·`beforeCreatedAt` 을 함께 보내면 기준 행 조회 1회를 생략할 수 있음. 응답에 `hasMore`·`nextCursor: { before, beforeCreatedAt }`(다음 과거 페이지용) 포함.
- 인덱스: `(room_id, created_at DESC, id DESC)` 단일 타임라인 인덱스(`chat_messages_room_created_at_id_desc_keyset_idx`)로 키셋 스캔에 맞춤; 예전 `(room_id, created_at DESC)` 전용 인덱스는 중복이라 제거됨.
- 방 요약·미읽음: `chat_rooms.last_message_*` 는 전송 시 한 번 `UPDATE`, `chat_room_participants.unread_count` 는 수신자별 증감·읽음 시 단건 `UPDATE`(메시지 테이블 `COUNT` 로 unread 를 매기지 않음).
- 클라이언트: 거래 채팅 상세(`ChatDetailView`)에서 스레드 상단 근처 스크롤 시 `before`·`beforeCreatedAt`·`nextCursor` 로 과거 페이지를 이어붙임(스크롤 위치 보정).

## 현재 (커뮤니티 메신저)

- 테이블: `community_messenger_messages` — 방별 최근 조회는 `(room_id, created_at, id)` 커서 + `LIMIT`.
- 증분 RPC: `community_messenger_room_messages_after` (마이그레이션에 정의).

## 인덱스 (핫 경로)

- 이미 코어 마이그레이션에 `community_messenger_messages_room_idx (room_id, created_at asc)` 가 있음 ([`20260604230000_community_messenger_core.sql`](../supabase/migrations/20260604230000_community_messenger_core.sql)).
- 동일 `created_at` 다건 정렬이 부족하면 `(room_id, created_at, id)` 복합 인덱스를 **별도 마이그레이션**으로 검토 (중복 인덱스 주의).

## 파티션 (트래픽·행 수가 임계치 초과 시)

- **전략**: `RANGE` 파티션 by `created_at` (월 단위).
- **전환**: 짧은 점검 윈도우에서 기존 테이블 → 파티션 테이블 마이그레이션 (복사 + 스왑).
- **쿼리**: 모든 목록 API는 **반드시** `room_id` + 시간/ id 커서 + `LIMIT`.

## 아카이브 테이블 (선택)

- `community_messenger_messages_archive` — N개월 이전 행을 배치로 이동.
- 앱 API는 **핫 테이블만** 기본 조회; “전체 기록”은 별 엔드포인트 + 아카이브 UNION (관리자/법적 보관용).

## 첨부

- DB에는 **메타데이터 + Storage 경로**만; 바이너리는 Supabase Storage (또는 외부 객체 스토어).

## 마이그레이션 파일

실제 `CREATE INDEX` / 파티션은 부하를 고려해 **CONCURRENTLY** 와 스테이징 검증 후 프로덕션 적용.
