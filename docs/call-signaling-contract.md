# 1:1 통화 시그널링 계약 (채팅 메시지와 분리)

일반 채팅 메시지 API·`community_messenger_messages` 테이블과 **같은 경로로 SDP/ICE를 보내지 않는다**. 시그널은 전용 HTTP 라우트와 `community_messenger_call_signals`에만 기록한다. 경계 규칙은 [`lib/chat-domain/ports/call-signaling-boundary.ts`](../lib/chat-domain/ports/call-signaling-boundary.ts)를 따른다.

## HTTP 엔드포인트

| 메서드 | 경로 | 용도 |
|--------|------|------|
| `GET` | `/api/community-messenger/calls/ice-servers` | STUN/TURN 목록 (인증, rate limit). 클라이언트는 [`lib/call/ice-servers.ts`](../lib/call/ice-servers.ts)로 조회 |
| `POST` | `/api/community-messenger/rooms/:roomId/calls` | 1:1 세션 생성 (body: `{ callKind: "voice" \| "video" }`) |
| `GET` / `POST` | `/api/community-messenger/calls/sessions/:sessionId/signals` | 시그널 조회·전송 |
| `PATCH` | `/api/community-messenger/calls/sessions/:sessionId` | 세션 상태 (`accept` \| `reject` \| `cancel` \| `missed` \| `end` 등) |

채팅 메시지 라우트(`.../messages`)는 통화 SDP를 처리하지 않는다.

## 시그널 메시지 (POST body)

```ts
type CallSignalPostBody = {
  toUserId: string;
  signalType: "offer" | "answer" | "ice-candidate" | "hangup";
  payload: Record<string, unknown>;
};
```

### `offer` / `answer`

- `payload.sdp`: string — 세션 설명 SDP 텍스트
- `payload`에는 WebRTC 표준 `RTCSessionDescriptionInit`와 호환되는 필드만 둔다

### `ice-candidate` (Trickle ICE)

- `payload.candidate`: `RTCIceCandidateInit` JSON (`candidate`, `sdpMid`, `sdpMLineIndex`, …)

### `hangup`

- `payload.reason` (string, 선택): `"end"` | `"reject"` | `"cancel"` | `"missed"` | 기타 — 클라이언트·서버가 동일한 문자열로 종료 사유를 맞춘다

## 세션 수명과 채팅 연동

- **실시간 시그널**: Supabase `postgres_changes` on `community_messenger_call_signals` + HTTP 폴링 백업 ([`use-community-messenger-call.ts`](../lib/community-messenger/use-community-messenger-call.ts)).
- **통화 로그/알림**: `call_stub` 메시지나 푸시는 **별도 파이프**로, 시그널 페이로드와 혼합하지 않는다.
- **감사**: 세션 행(`community_messenger_call_sessions` 등)에 참여자·시작/종료 시각·종료 사유를 둔다(기존 서비스 스키마 따름).

## 버전·멱등

- 시그널 행은 `id`(UUID)로 중복 적용을 막는다; 클라이언트는 이미 처리한 `signal.id`를 건너뛴다.
- 동일 `offer` 재전송 시 서버는 새 행이 될 수 있으므로, 클라이언트 측 processed set이 필수다.

## 보안

- 모든 라우트는 인증된 사용자만; `toUserId`는 세션 멤버십과 일치해야 한다(서버 검증).
- Rate limit은 라우트별로 적용됨 (`signals` GET/POST, `ice-servers` GET).
