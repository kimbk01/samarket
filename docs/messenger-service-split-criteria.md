# Chat API / Realtime Gateway 분리 기준 · DTO 계약

**도메인별 유지 / 최적화 / 분리 평가:** [messenger-supabase-split-evaluation.md](./messenger-supabase-split-evaluation.md)

## 언제 분리를 검토할지 (정량)

| 신호 | 임계 예시 |
|------|-----------|
| Next 배포 주기가 채팅 SLO와 충돌 | 핫픽스가 UI와 채팅 API를 동시에 묶어야 함 |
| Supabase Realtime 비용·연결 수 | 동시 접속·초당 이벤트가 문서화된 한도 근접 |
| p95 부트스트랩/메시지가 SLO 상시 초과 | 인프라 수평 확장만으로 개선 안 됨 |
| 인스턴스 N개 시 인메모리 모니터링이 의미 없음 | 노드별 집계만으로 장애 분석 불가 |

## 분리 시 유지할 계약 (DTO)

- **부트스트랩 응답**: `CommunityMessengerRoomSnapshot` ([`lib/community-messenger/types.ts`](../lib/community-messenger/types.ts)) — 필드 추가는 버전/Feature flag.
- **메시지 페이지**: `{ messages[], hasMore, mode: before | after }` — 커서는 메시지 `id` + 서버 정렬 일치.
- **인증**: BFF가 세션 검증 후 `userId` 를 chat-api 에 전달 (내부 mTLS 또는 서명 JWT).

## 단계

1. **동일 DTO**로 `chat-api` 를 두고 Next `app/api` 는 프록시만.
2. Realtime 은 Supabase 유지 → 부하 시 **전용 gateway** 가 동일 이벤트 스키마를 발행.

## 관련 코드

- 포트: [`lib/chat-domain/ports/community-messenger-read.ts`](../lib/chat-domain/ports/community-messenger-read.ts)
- 어댑터: [`lib/chat-infra-supabase/community-messenger/supabase-read-adapter.ts`](../lib/chat-infra-supabase/community-messenger/supabase-read-adapter.ts)
