/**
 * §17-4 R-3 (통화 규정 · Owner 2026-10-25 승인): 발신 진입(대화방 머리글·방 메뉴·통화 목록)이 막힌 이유 안내 키.
 * 표시·누름 처리 전용 — 발신 시작·권한 서버·푸시는 무관(서버 거부가 최종 방어선).
 * 상대가 나를 차단한 사실은 드러내지 않는다(그 경우 일반 문구).
 */
export type DirectCallUnavailableReasonKey =
  | "cm_call_unavailable_dialing"
  | "cm_call_unavailable_rejected"
  | "cm_call_unavailable_blocked_by_me"
  | "cm_call_unavailable_generic";

export function resolveDirectCallUnavailableReasonKey(input: {
  outgoingDialLocked?: boolean;
  roomUnavailable?: boolean;
  directMessageDenied?: "blocked" | "rejected_by_peer" | null;
  blockedByMe?: boolean;
}): DirectCallUnavailableReasonKey | null {
  if (input.outgoingDialLocked) return "cm_call_unavailable_dialing";
  if (!input.roomUnavailable) return null;
  if (input.blockedByMe) return "cm_call_unavailable_blocked_by_me";
  if (input.directMessageDenied === "rejected_by_peer") return "cm_call_unavailable_rejected";
  return "cm_call_unavailable_generic";
}

/** 통화 목록 행 — 대화·통화 불가(내가 차단 ∪ 상대 거절) 표시된 상대 */
export function resolveCallLogUnavailableReasonKey(input: {
  blockedByMe: boolean;
}): DirectCallUnavailableReasonKey {
  return input.blockedByMe ? "cm_call_unavailable_blocked_by_me" : "cm_call_unavailable_rejected";
}
