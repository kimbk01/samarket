# 네이티브 메신저 대비: 1:1이 무겁게 느껴지는 구조적 이유와 사마켓 대응

카카오톡·텔레그램·바이버류는 **OS 프로세스 + 로컬 동기화 엔진**에 가깝고, UI 스레드와 메시지 파이프가 오래 분리되어 왔다. 사마켓은 **Next.js 웹 + Supabase(HTTP 부트스트랩 + Realtime)** 이므로 같은 “즉시성”을 전제로 두면 오해가 생긴다. 아래는 **구조 차이**이며, “못 한다”가 아니라 **웹에서 맞출 경계**를 정의한다.

| 항목 | 네이티브(참고) | 사마켓(웹) | 체감에 미치는 영향 |
|------|----------------|------------|---------------------|
| 런타임 | 단일 앱 프로세스 | 브라우저 탭 + JS 번들 + RSC | 첫·이동 시 컴파일·페치 비용 |
| 동기화 | 전용 DB/소켓 레이어가 백그라운드 상주 | `GET` 부트스트랩 후 `postgres_changes` 구독 | JWT·구독 타이밍 레이스 가능 (대응: `wait-for-realtime-auth`, 방 구독 게이트) |
| 메시지 머지 | 네이티브 모델 레이어 | React state + 배치 머지 | 한 훅에 몰리면 리렌더·디버깅 비용 증가 |
| 개발 | 해당 없음 | `next dev` 온디맨드 컴파일 | 백그라운드 prefetch/워밍이 체감 악화 (대응: `lib/runtime/next-js-dev-client.ts`) |

## 사마켓이 “구조적으로” 맞추는 방향

1. **계약**: [messenger-bootstrap-contract.md](./messenger-bootstrap-contract.md) — RSC/클라 부트스트랩 필드·`lite` 경계 고정.
2. **Realtime 정책**: [messenger-realtime-policy.md](./messenger-realtime-policy.md) — 방당 채널 번들, 이벤트→전체 GET 남발 금지.
3. **1:1 메시지 수신 파이프 분리**: [`useMessengerRoomRealtimeMessageIngest`](../lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts) — WebSocket 이벤트 → rAF 배치 → `mergeRoomMessages` 만 담당(Phase1 비대화 완화의 첫 단계). 실제 호출은 [`use-messenger-room-client-phase1.ts`](../lib/community-messenger/room/use-messenger-room-client-phase1.ts)에서 한다.
4. **인프라 한계와 분리 시점**: [messenger-supabase-split-evaluation.md](./messenger-supabase-split-evaluation.md) — 트래픽 신호 전까지 Postgres+Realtime 유지.

이 문서는 제품·온보딩용 “왜 네이티브와 다르게 짜는가”의 **고정 기준**으로 두고, 구현 변경 시 위 링크 구현과 함께 갱신한다.
