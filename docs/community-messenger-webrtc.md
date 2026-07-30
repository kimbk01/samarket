# 커뮤니티 메신저 WebRTC (1:1·그룹 P2P)

## 시그널링 흐름 (직접 통화)

```mermaid
sequenceDiagram
  participant A as 발신 브라우저
  participant API as Next API (세션·시그널)
  participant DB as Supabase (call_signals)
  participant B as 수신 브라우저

  A->>API: POST /rooms/:roomId/calls (세션 생성)
  API-->>A: sessionId
  par 병렬 준비
    A->>A: getUserMedia + ICE 서버 캐시
  end
  A->>A: RTCPeerConnection + createOffer
  A->>API: POST .../signals (offer)
  API->>DB: INSERT signal
  B->>DB: Realtime INSERT 또는 GET 폴링
  B->>B: setRemoteDescription(offer) + createAnswer
  B->>API: POST .../signals (answer)
  A->>DB: answer 수신
  A->>A: setRemoteDescription(answer)
  loop Trickle ICE
    A->>API: ice-candidate
    B->>API: ice-candidate
  end
  A<-->B: STUN/TURN 경로 협상 후 미디어
```

## 최적화된 WebRTC 설정 (레거시 P2P 참고)

> **삭제됨 (Fix 5):** `lib/call/createPeerConnection.ts`, `lib/call/webrtc-configuration.ts` — runtime importer 0.
> 제품 통화 establishment는 **Native Runtime / Agora / Call V4·V3·CallEngine** 경로를 사용한다. 아래 ICE·미디어 표는 과거 P2P 참고용이며, 새 헬퍼를 재도입하지 않는다.

ICE 서버 목록은 **`GET /api/community-messenger/calls/ice-servers`** (인증) · `lib/call/ice-servers.ts` (`fetchMessengerIceServers` / `warmMessengerIceServers`)에서 내려줍니다.

| 항목 | 값 | 목적 |
|------|-----|------|
| `iceTransportPolicy` | `all` | STUN + TURN 모두 시도 (NAT·대칭 NAT) |
| `bundlePolicy` | `max-bundle` | RTP/RTCP 단일 포트로 지연·방화벽 부담 감소 |
| `rtcpMuxPolicy` | `require` | RTCP 멀티플렉싱 |
| `iceCandidatePoolSize` | `8` | (Chromium) ICE 수집 선행 |

### 환경 변수 (서버)

- `COMMUNITY_MESSENGER_STUN_URLS` — 쉼표/줄바꿈 구분 STUN
- `COMMUNITY_MESSENGER_TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` — 주 TURN
- `COMMUNITY_MESSENGER_TURN_FALLBACK_URLS` + 선택적 `TURN_FALLBACK_USERNAME` / `TURN_FALLBACK_CREDENTIAL` — 보조 TURN (주와 URL·자격이 같으면 중복 제거)

운영에서는 **자체 Coturn/클라우드 TURN**을 쓰고, 공개 STUN만으로는 대칭 NAT 한계가 있습니다.

### 미디어 (느린 링크)

- 영상: 연결 후 `degradationPreference: maintain-framerate` (오디오·움직임 우선)
- RTT가 나쁘게 측정되면 송신 비디오 `maxBitrate` 상한 + `scaleResolutionDownBy: 2` 적용 — Agora 클라와 동일 정책

### 사전 준비

- `CommunityMessengerMediaPreflight`: 마이크/카메라 권한·장치 ID
- `warmMessengerIceServers()` (유휴 시): ICE 목록 HTTP 선요청

## 샘플: ICE 서버만 조회

```typescript
import { fetchMessengerIceServers } from "@/lib/call/ice-servers";

const iceServers = await fetchMessengerIceServers();
```
