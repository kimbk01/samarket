/**
 * 통화 기록(통화 탭) 표시 분류 SSOT — 서버 `listCommunityMessengerCallLogs` 와 클라이언트 presenter 공용.
 *
 * viewer 관점 해석은 타임라인·목록과 동일하게 `resolveCallEventCanonical` 만 사용한다.
 * - 발신자 취소: 발신자 `outgoing_cancelled`(취소됨) / 수신자 `incoming_missed`(부재중)
 * - 미응답: 발신자 `unanswered`(응답 없음) / 수신자 `incoming_missed`(부재중)
 * - 거절: 수신자 `local_rejected`(거절함) / 발신자 `remote_rejected`(거절됨)
 *
 * 서버 전용 의존성이 없어야 한다 (client presenter 에서도 import).
 */
import {
  resolveCallEventCanonical,
  type CallEventCanonicalResult,
} from "@/lib/community-messenger/call-event-presentation";
import type {
  CommunityMessengerCallLogDisplayType,
  CommunityMessengerCallStatus,
} from "@/lib/community-messenger/types";

export type CallLogViewerInput = {
  status: CommunityMessengerCallStatus | string | null | undefined;
  /** community_messenger_call_sessions.ended_reason */
  endedReason: string | null | undefined;
  /** call_logs.caller_user_id === viewer */
  isOutgoing: boolean;
};

/** call log 1행 → viewer 관점 canonical (타임라인·stub 과 같은 resolver) */
export function resolveCallLogViewerCanonical(input: CallLogViewerInput): CallEventCanonicalResult {
  const status = typeof input.status === "string" ? input.status.trim().toLowerCase() : "";
  const er = typeof input.endedReason === "string" ? input.endedReason.trim().toLowerCase() : "";
  /** E-C1 — busy wire on cancelled (or any) status */
  if (er === "caller_busy") return "self_busy";
  if (er === "peer_busy" || er === "callee_busy" || er === "busy") return "remote_busy";
  /** 연결 후 종료 로그라도 세션 종료 사유가 failed_* 이면 연결 실패 */
  const resolvedEvent = status === "ended" && er.startsWith("failed_") ? "failed" : null;
  return resolveCallEventCanonical({
    resolvedEvent,
    callStatusFallback: status || null,
    viewerRole: input.isOutgoing ? "caller" : "callee",
  });
}

/** canonical → 통화 탭 표시 분류 (거절 방향은 `isOutgoing` 으로 구분) */
export function callLogDisplayTypeFromCanonical(
  canonical: CallEventCanonicalResult,
  isOutgoing: boolean
): CommunityMessengerCallLogDisplayType {
  switch (canonical) {
    case "outgoing_started":
      return "outgoing";
    case "incoming_received":
      return "incoming";
    case "connected_ended":
      return isOutgoing ? "outgoing" : "incoming";
    case "outgoing_cancelled":
      return "cancelled";
    case "incoming_missed":
      return "missed_incoming";
    case "unanswered":
      return "missed_outgoing";
    case "remote_rejected":
    case "local_rejected":
      return "rejected";
    case "remote_busy":
    case "self_busy":
      return "busy";
    case "failed":
    case "interrupted":
      return "failed";
    default: {
      const _exhaustive: never = canonical;
      void _exhaustive;
      return isOutgoing ? "outgoing" : "incoming";
    }
  }
}

export function computeCallLogDisplayType(
  status: CommunityMessengerCallStatus | string | null | undefined,
  endedReason: string | null | undefined,
  isOutgoing: boolean
): CommunityMessengerCallLogDisplayType {
  return callLogDisplayTypeFromCanonical(
    resolveCallLogViewerCanonical({ status, endedReason, isOutgoing }),
    isOutgoing
  );
}

/** 통화 탭 배지 — viewer 관점 상태 한 단어 (부제는 통화 종류·통화시간만) */
export function resolveCallLogBadgeMessageKey(canonical: CallEventCanonicalResult, isOutgoing: boolean): string {
  switch (canonical) {
    case "outgoing_started":
      return "cm_call_status_outgoing_answered";
    case "incoming_received":
      return "cm_call_status_incoming_answered";
    case "connected_ended":
      return isOutgoing ? "cm_call_status_outgoing_answered" : "cm_call_status_incoming_answered";
    case "outgoing_cancelled":
      return "cm_call_status_cancelled";
    case "incoming_missed":
      return "cm_call_status_missed";
    case "unanswered":
      return "cm_call_status_no_answer";
    case "local_rejected":
      return "cm_call_status_rejected_by_me";
    case "remote_rejected":
      return "cm_call_status_rejected_by_peer";
    case "remote_busy":
      return "cm_call_status_busy_peer";
    case "self_busy":
      return "cm_call_status_busy_self";
    case "failed":
    case "interrupted":
      return "cm_call_status_failed";
    default: {
      const _exhaustive: never = canonical;
      void _exhaustive;
      return "cm_call_status_failed";
    }
  }
}
