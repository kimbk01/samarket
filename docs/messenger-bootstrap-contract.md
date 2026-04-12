# 단일 부트스트랩 계약 (MessengerBootstrapV1)

방 입장 시 **한 번의 GET**으로 목록·헤더·초대화·읽음·참가자(캡)까지 채우고, 나머지는 **지연 로드**한다. 도메인별 실제 URL은 다를 수 있으나 **논리 계약**은 동일한다.

**관련:** [messenger-bootstrap-and-payload-limits.md](./messenger-bootstrap-and-payload-limits.md), [messenger-performance-targets.md](./messenger-performance-targets.md) §2, [messenger-production-slo.md](./messenger-production-slo.md).

---

## 1. 논리 응답 형태

| 필드 | 필수 | 설명 |
|------|------|------|
| `ok` | 커뮤니티 등 | JSON 본문에 `ok: true` 를 쓰는 라우트만. 거래 부트스트랩은 HTTP 200 + `room`/`messages` 로 성공 판별 |
| `v` | 권장 | 계약 버전. 현재 **1** |
| `domain` | 권장 | `trade` \| `community` \| `store_order` (추론값과 동일) |
| `room` | 예 | 방 요약 (`ChatRoom` 또는 커뮤니티 room summary) |
| `messages` | 예 | 최근 N개만 (커서로 이전 메시지) |
| `unread` | 권장 | `{ count: number, lastReadAt?: string \| null }` — 별도 unread GET 금지 |
| `participants` | 선택 | `{ userId: string, role?: string }[]` 캡 적용. DM은 buyer/seller 2명 |
| `pinned` | 선택 | 고정 공지·시스템 배너 등 |
| `extras` | 선택 | 도메인 전용(예: `activeCall`) |

거래·통합 채팅 HTTP: [`GET /api/chat/room/[roomId]/bootstrap`](../app/api/chat/room/[roomId]/bootstrap/route.ts).  
커뮤니티: [`GET /api/community-messenger/rooms/[roomId]/bootstrap`](../app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts) — 필드명은 스냅샷이나 위 표와 매핑.

---

## 2. 로딩 시퀀스 (클라이언트)

1. (선택) RSC가 `serverBootstrap`으로 room+messages 주입 → 클라 **추가 GET 생략**.
2. 없으면 **단일** `GET .../bootstrap` (`runSingleFlight`로 중복 합류).
3. 성공 시 캐시 반영 → **`tradeChatBootstrapReady` 등 게이트 true**.
4. **그 다음에만** Supabase Realtime 구독 (`useChatRoomRealtime` 등 `enabled`).
5. 이전 메시지·전체 멤버·미디어 메타는 **커서/별도 GET** (lazy).

`ChatRoomScreen` 마운트 시 `warmChatRoomEntryById`와 `reload`를 **동시에** 돌리지 않는다(요청 중복). 링크 호버·글 상단 등 **프리페치 전용** `warmChatRoomEntryById`는 유지해도 된다(`runSingleFlight`로 합류 가능).

---

## 3. 에러 시퀀스

| 단계 | 동작 |
|------|------|
| 401/403 | 로그인 유도. Realtime 구독 없음. |
| 404 | 방 없음 UI. |
| 네트워크/5xx | 동일 부트스트랩 재시도 권장. **상세만** 가져오는 폴백은 요청 수 증가 — 필요 시 1회만·메시지 없음 degraded 명시. |
| 부분 성공 없음 | `room` 없이 Realtime 시작하지 않음. |

---

## 4. Lazy 경계 (부트스트랩에 넣지 않음)

- 오래된 메시지 (`before` 커서)
- 미디어 상세·썸네일 외 메타
- 멤버 **전체** 목록(그룹은 offset 페이지)
- 확장 프로필·친구 관계 전부

---

## 5. 커뮤니티 메신저

[`CommunityMessengerRoomClient`](../components/community-messenger/CommunityMessengerRoomClient.tsx)는 `roomReadyForRealtime`로 **HTTP 부트스트랩 성공 후** Realtime을 켠다. 별도 공통 훅으로 흡수하지 않아도 **동일 패턴**을 만족한다.

---

## 6. 그룹 채팅 (100+ 멤버)

논리 계약은 위와 동일(단일 GET → 게이트 → Realtime 1채널). 필드 캡·Lazy·시퀀스 unread 는 [group-chat-bootstrap.md](./group-chat-bootstrap.md), 스키마·축 분리는 [group-chat-schema.md](./group-chat-schema.md) 를 따른다.
