/**
 * 통화 기록 재발신 — 서버 권위 방 해석 클라이언트 (`POST /api/community-messenger/calls/redial-room`).
 * 기록의 roomId 를 그대로 쓰지 않는다: 나간/읽기전용/격리/도메인 없는 방이면 서버가
 * canonical general direct 방(생성·재입장·숨김 해제)을 돌려준다. 네이티브 발신 레인도
 * 이 결과 roomId 만 받는다 (`launchOutgoingDirectCall`).
 */
import { resolveMessengerActionReturnPath } from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { resolveDirectCallDenyUserMessageFromApiError } from "@/lib/community-messenger/direct-call-permission-messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export const CALL_HISTORY_REDIAL_ROOM_API_PATH = "/api/community-messenger/calls/redial-room";

export type CallHistoryRedialRoomClientResult =
  | { ok: true; roomId: string; source: "historic_room" | "canonical_direct" }
  | { ok: false; error: string; userMessage: string; phoneVerificationRequired?: boolean };

export function callHistoryRedialRoomFailureMessage(error: string): string {
  const deny = resolveDirectCallDenyUserMessageFromApiError(error);
  if (deny) return deny;
  return safeTranslate(getRuntimeAppLanguage(), "cm_call_deny_room_mismatch", {
    fallbackKo: "이 대화방 상태에서는 통화를 시작할 수 없습니다.",
    fallbackEn: "You cannot start a call in this room state.",
  });
}

export async function resolveCallHistoryRedialRoomClient(input: {
  peerUserId: string | null;
  roomId: string | null;
  signal?: AbortSignal;
}): Promise<CallHistoryRedialRoomClientResult> {
  const peerUserId = input.peerUserId?.trim() || null;
  const roomId = input.roomId?.trim() || null;
  if (!peerUserId && !roomId) {
    return { ok: false, error: "missing_room", userMessage: callHistoryRedialRoomFailureMessage("missing_room") };
  }
  const res = await fetch(CALL_HISTORY_REDIAL_ROOM_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ peerUserId, roomId }),
    signal: input.signal,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    roomId?: string;
    source?: string;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.ok || !json.roomId?.trim()) {
    if (isPhoneVerificationRequiredApiPayload(json)) {
      openPhoneVerificationRequiredSheet({ next: resolveMessengerActionReturnPath() });
      return { ok: false, error: "phone_verification_required", userMessage: "", phoneVerificationRequired: true };
    }
    const error = String(json.error ?? "redial_room_failed");
    return { ok: false, error, userMessage: callHistoryRedialRoomFailureMessage(error) };
  }
  return {
    ok: true,
    roomId: json.roomId.trim(),
    source: json.source === "historic_room" ? "historic_room" : "canonical_direct",
  };
}
