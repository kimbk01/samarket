/**
 * 통화 미디어 스택 구분 — WebRTC 메시(그룹) vs Agora 관리(토큰·채널)
 *
 * - **WebRTC_Group**: [`use-community-messenger-group-call`] — `RTCPeerConnection` + 자체 시그널(`community_messenger_call_signals`).
 * - **Agora_Managed**: [`call-provider/client`] — `IAgoraRTCClient` + Agora 채널·토큰 ([`call-provider/server`]).
 *
 * 시그널링만 서버/DB, 미디어는 클라이언트↔SFU/Peer 직접. ICE 는 [`app/api/community-messenger/calls/ice-servers`].
 *
 * 새 통화 유형 추가 시 이 enum 에 값을 추가하고, UI/훅에서 한 경로만 선택하도록 한다.
 */
export type CommunityMessengerMediaStack = "webrtc_group" | "agora_managed";

export function describeCommunityMessengerMediaStack(stack: CommunityMessengerMediaStack): string {
  switch (stack) {
    case "webrtc_group":
      return "그룹 WebRTC (PeerConnection + 자체 시그널 테이블)";
    case "agora_managed":
      return "Agora RTC (채널 입장·토큰·로컬 트랙)";
    default:
      return "unknown";
  }
}
