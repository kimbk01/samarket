# 그룹 음성·영상 통화 로드맵 (SFU, 메시 비활성)

N명(N>3) **full mesh WebRTC**는 대역·CPU·모바일 배터리 측면에서 운영 불가에 가깝다. 그룹 실연결은 **단일 SFU**(자체 배포 또는 관리형 CPaaS)를 전제로 한다.

## 원칙

- **시그널링**은 1:1과 동일하게 채팅 메시지와 **분리**한다. 확장 필드만 추가한다.
- **미디어**는 P2P가 아니라 SFU 업링크/다운링크; 바이트는 앱 DB를 거치지 않는다.
- **메시(mesh) P2P 그룹 통화는 지원 대상에서 제외**한다.

## 시그널링 확장 (개략)

| 항목 | 1:1 | 그룹(SFU) |
|------|-----|-----------|
| 세션 식별 | `sessionId` | 동일 + `sfuRoomName` 또는 공급자 세션 id |
| SDP 방향 | 양단 offer/answer | 클라이언트↔SFU negotiate(공급자 SDK가 캡슐화할 수 있음) |
| 추가 페이로드 | — | `publishToken`, `subscribeToken`, 또는 Agora 채널명+uid(기존 `call-provider` 패턴) |

서버는 참가자별로 **토큰 발급·갱신**만 담당하고, 미디어 릴레이는 SFU 인프라가 담당한다.

## 상태 머신

- `connected` = **SFU에 publish/subscribe 성공** (첫 키프레임/오디오 패킷 정책은 제품별).
- `reconnecting` = 전송 단(transport) 재연결; ICE restart 대신 **공급자 SDK의 reconnect**에 매핑한다.

## SAMarket 코드베이스 정렬

- 그룹 **관리형** 경로: [`CommunityMessengerCallClient`](../components/community-messenger/CommunityMessengerCallClient.tsx) + Agora 등 — 이미 P2P 메시가 아님.
- **직접 WebRTC** 그룹: [`use-community-messenger-group-call.ts`](../lib/community-messenger/use-community-messenger-group-call.ts)는 실험/제한적; 프로덕션 그룹 실연결 시 SFU로 교체하거나 비활성화한다.

## 마이그레이션 체크리스트

1. SFU 공급자 선정(자체 mediasoup/Janus vs 관리형).
2. 시그널 API에 토큰 필드 추가; RLS·rate limit 유지.
3. 클라이언트: 단일 `RTCPeerConnection` 대신 SDK 세션 또는 SFU용 PC 분리.
4. 모니터링: SFU 측 bitrate·패킷 손실이 있으면 클라이언트 `getStats`는 보조만.
