# 부트스트랩·페이로드 한도 (커뮤니티 메신저) · 타 채팅 적용 범위

**제품 단 gzip·API 횟수 등 상위 한도:** [messenger-performance-targets.md](./messenger-performance-targets.md) §2.

**단일 부트스트랩 논리 계약(v1)·로딩/에러·lazy:** [messenger-bootstrap-contract.md](./messenger-bootstrap-contract.md).

**Supabase 유지·스케일 시 분리:** [messenger-supabase-split-evaluation.md](./messenger-supabase-split-evaluation.md).

## 커뮤니티 메신저 (현재 코드 기준)

| 항목 | 상수/동작 | 파일 |
|------|-----------|------|
| 초기 메시지 윈도 | `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT` (30) | [`lib/community-messenger/types.ts`](../lib/community-messenger/types.ts) |
| 부트스트랩 멤버 프로필 상한 | `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP` (60) | 동일 |
| 메시지 페이지 | `before` / `after` 커서, `LIMIT` 상한 100 | [`lib/community-messenger/service.ts`](../lib/community-messenger/service.ts), messages route |
| 멤버 추가 페이지 | `GET .../members?offset=&limit=` | [`app/api/community-messenger/rooms/[roomId]/members/route.ts`](../app/api/community-messenger/rooms/[roomId]/members/route.ts) |

**원칙:** 한 번의 부트스트랩에 **전체 히스토리·전원 프로필**을 넣지 않는다. 나머지는 **커서 API + Realtime 증분**으로만.

## 거래 채팅 · 스토어/주문 채팅 (적용 범위 결정)

| 영역 | 권장 |
|------|------|
| **동일 원칙** | 방 입장 시 **최근 N메시지 + 필요 메타만**, 목록은 **페이지네이션/커서** |
| **구현 위치** | [`lib/chats`](../lib/chats), [`app/api/chat`](../app/api/chat), trade 전용 resolver — **커뮤니티 메신저와 코드 공유는 선택** (`lib/chat-domain` 포트로 통합 시) |
| **즉시 작업** | 거래/스토어 각각 **기존 API 응답 크기**를 점검하고, 커뮤니티와 동일 한도가 없으면 **별도 상수 문서화** 후 단계적 축소 |

**결론:** 프로덕션 체감 속도 목표에 맞춰 **모든 채팅 유형이 동일한 “슬림 부트스트랩 + 커서” 패턴**을 따르도록 하되, **레거시 경로는 리스크 순으로 순차 적용**한다.
