import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

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

const FAILURE_DETAIL_KEY: Record<MessengerCallClientFailureReason, MessageKey> = {
  failed_permission: "cm_ui_call_failed_permission_detail_voice",
  failed_insecure_context: "cm_ui_call_failed_insecure_context_detail",
  failed_ice: "cm_ui_call_failed_ice_detail",
  failed_network: "cm_ui_call_failed_network_detail",
  failed_signaling: "cm_ui_call_failed_signaling_detail",
};

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
  const lang = getRuntimeAppLanguage();
  if (input.endedReason === "failed_insecure_context") {
    return translate(lang, "cm_ui_call_https_required_headline");
  }
  if (input.endedReason === "failed_permission") {
    return translate(
      lang,
      input.callKind === "video" ? "cm_ui_mic_camera_permission_required" : "cm_ui_mic_permission_required"
    );
  }
  return null;
}

export function messengerCallFailureEndedDetail(
  reason: MessengerCallClientFailureReason,
  mediaKind?: CommunityMessengerCallKind
): string {
  const lang = getRuntimeAppLanguage();
  if (reason === "failed_permission" && mediaKind === "video") {
    return translate(lang, "cm_ui_call_failed_permission_detail_video");
  }
  return translate(lang, FAILURE_DETAIL_KEY[reason]);
}
