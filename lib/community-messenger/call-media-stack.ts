/**
 * 통화 미디어 스택 — Agora SFU (1:1·그룹 공통)
 *
 * - **Agora_Managed**: [`call-provider/client`] — `IAgoraRTCClient` + Agora 채널·토큰 ([`call-provider/server`]).
 * - 1:1: [`CommunityMessengerCallClient`] · 그룹: [`use-community-messenger-group-call`] + [`group-agora-session`].
 *
 * 시그널링은 세션 PATCH·토큰 API; 미디어는 Agora SFU 직결.
 */
export type CommunityMessengerMediaStack = "agora_managed";

export function describeCommunityMessengerMediaStack(stack: CommunityMessengerMediaStack): string {
  switch (stack) {
    case "agora_managed":
      return "Agora RTC (채널 입장·토큰·로컬 트랙)";
    default:
      return "unknown";
  }
}

export function communityMessengerMediaStackForSessionMode(
  sessionMode: "direct" | "group"
): CommunityMessengerMediaStack {
  void sessionMode;
  return "agora_managed";
}
