import { COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC } from "@/lib/community-messenger/media-errors";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export const MESSENGER_CALL_CLIENT_FAILURE_REASONS = [
  "failed_permission",
  "failed_insecure_context",
  "failed_ice",
  "failed_network",
  "failed_signaling",
] as const;

export type MessengerCallClientFailureReason = (typeof MESSENGER_CALL_CLIENT_FAILURE_REASONS)[number];

export function isMessengerCallClientFailureReason(s: string): s is MessengerCallClientFailureReason {
  return (MESSENGER_CALL_CLIENT_FAILURE_REASONS as readonly string[]).includes(s);
}

const HTTPS_BLOCK = "HTTPS";
const AGORA_CONFIG = "Agora";

/**
 * Agora·GUM·fetch 흐름에서 join 실패를 4가지 ended_reason 코드로 분류한다.
 */
export function classifyMessengerCallJoinFailure(
  error: unknown,
  mediaKind: CommunityMessengerCallKind
): MessengerCallClientFailureReason {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (
    msg.includes(HTTPS_BLOCK) ||
    msg.includes(COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC) ||
    /web_security_restrict|limited by web security|issecurecontext/i.test(msg)
  ) {
    return "failed_insecure_context";
  }

  if (/permission|denied|notallowed|notreadable|getusermedia|기기|마이크|카메라/i.test(msg)) {
    return "failed_permission";
  }

  if (/token|session.*찾을 수 없|signal|fetchconnection|401|403|not_found|rate_limit/i.test(lower)) {
    return "failed_signaling";
  }

  if (/ice|rtcpeer|sdp|setlocaldescription|setremotedescription/i.test(lower)) {
    return "failed_ice";
  }

  if (/network|timeout|offline|disconnect|fetch/i.test(lower)) {
    return "failed_network";
  }

  if (msg.includes(AGORA_CONFIG)) {
    return "failed_signaling";
  }

  void mediaKind;
  return "failed_network";
}

/**
 * 종료 카드 메인 제목 — 나머지 실패는 상위에서 「통화가 종료되었습니다」 + 상세 유지.
 */
export function messengerCallTerminalFailureHeadline(input: {
  status: string;
  endedReason: string | null | undefined;
  callKind: CommunityMessengerCallKind;
  joined: boolean;
}): string | null {
  if (input.status !== "ended" || input.joined || !input.endedReason) return null;
  if (!isMessengerCallClientFailureReason(input.endedReason)) return null;
  if (input.endedReason === "failed_insecure_context") return "보안 연결에서만 통화할 수 있습니다";
  if (input.endedReason === "failed_permission") {
    return input.callKind === "video" ? "마이크·카메라 권한이 필요합니다" : "마이크 권한이 필요합니다";
  }
  return null;
}

export function messengerCallFailureEndedDetail(
  reason: MessengerCallClientFailureReason,
  mediaKind?: CommunityMessengerCallKind
): string {
  switch (reason) {
    case "failed_permission":
      return mediaKind === "video"
        ? "브라우저 주소창의 자물쇠에서 마이크·카메라를 허용하거나, 기기 설정에서 접근을 허용해 주세요."
        : "브라우저 주소창의 자물쇠에서 마이크를 허용하거나, 기기 설정에서 마이크 접근을 허용해 주세요.";
    case "failed_insecure_context":
      return "HTTPS 주소(자물쇠 표시)로 접속해야 통화할 수 있습니다. PC는 https://localhost 또는 dev 서버가 안내하는 https 주소를 이용하세요.";
    case "failed_ice":
      return "통화 연결(ICE)에 실패했습니다.";
    case "failed_network":
      return "네트워크 상태를 확인해 주세요.";
    case "failed_signaling":
      return "통화 서버 연결에 실패했습니다.";
    default:
      return "";
  }
}
