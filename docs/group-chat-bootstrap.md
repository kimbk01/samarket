# 그룹 채팅 부트스트랩 계약 (100+ 멤버)

[단일 부트스트랩 계약](./messenger-bootstrap-contract.md)과 동일한 **한 번의 GET** 원칙. URL 예: `GET /api/group-chat/rooms/:roomId/bootstrap` (구현 시 프로젝트 라우트에 맞게 조정).

---

## 1. 페이로드 한도 (권장 기본값)

| 항목 | 한도 | 비고 |
|------|------|------|
| 초기 메시지 `messages` | **N = 50** | 키셋 이전 페이지는 `GET .../messages?before&beforeCreatedAt` |
| 멤버 스냅샷 `members` | **K = 20** | 아바타·닉네임 슬림 필드만 |
| `memberCount` | 숫자 | 전체 인원 |
| `hasMoreMembers` | boolean | true 이면 멤버 탭에서 페이지 로드 |
| gzip 후 본문 | [messenger-performance-targets.md](./messenger-performance-targets.md) §2 | ≤80 KB 권장 |

`unread`: `{ count: number, lastReadSeq?: number }` — 시퀀스 모델일 때 `count = max(0, room.message_seq - member.last_read_seq)`.

---

## 2. 응답 필드 (논리 매핑)

| 필드 | 필수 | 설명 |
|------|------|------|
| `v` | 권장 | `1` |
| `domain` | 권장 | `group` |
| `room` | 예 | 제목, 설정 요약, 내 역할 |
| `messages` | 예 | 최근 N개, 시간순(오래된 것 먼저) 또는 클라 규약에 맞춰 일관 |
| `unread` | 예 | 위 참조 |
| `members` | 예 | 캡 K, `{ userId, nickname?, avatarUrl?, role? }[]` |
| `memberCount` | 예 | |
| `hasMoreMembers` | 예 | |
| `pinned` | 선택 | 고정 메시지 id 요약 |

---

## 3. Lazy 경계 (부트스트랩에 넣지 않음)

- 전체 멤버 목록·검색 인덱스
- 오래된 메시지 전부
- 전 멤버 프로필·친구 관계
- 전 멤버 읽음·프레즌스
- 미디어 원본·갤러리 전체
- 감사 로그·신고 상세 (관리자 API)
- 링크 프리뷰 fetch

**구현 참고:** 거래 통합 채팅 메시지 키셋은 [lib/chats/server/load-chat-room-messages.ts](../lib/chats/server/load-chat-room-messages.ts) 패턴과 동일하게 `(created_at, id)` 커서.

---

## 4. 클라이언트 시퀀스

1. 단일 `GET .../bootstrap` (`runSingleFlight`).
2. 성공 후 `groupChatBootstrapReady` 등 게이트 true.
3. **그 다음에만** Realtime 구독 ([group-chat-realtime.md](./group-chat-realtime.md)).
4. 멤버 전체·과거 메시지·설정은 지연 API.
