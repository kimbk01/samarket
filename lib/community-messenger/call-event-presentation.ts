/**
 * 통화 이벤트 표시 SSOT — raw terminal reason / DB status → canonical → viewer 문구.
 * UI·목록·DB content writer 는 이 모듈만 사용한다 (문자열 substring 판별 금지).
 */
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallStatus,
} from "@/lib/community-messenger/types";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import type { CallSessionResolvedEvent, CallSessionViewerRole } from "@/lib/community-messenger/call-event-message";

/** 제품 canonical terminal / in-flight 결과 */
export type CallEventCanonicalResult =
  | "outgoing_started"
  | "incoming_received"
  | "connected_ended"
  | "outgoing_cancelled"
  | "incoming_missed"
  | "remote_rejected"
  | "local_rejected"
  | "remote_busy"
  | "failed"
  | "unanswered"
  | "interrupted";

export type CallEventPresentation = {
  canonical: CallEventCanonicalResult;
  /** 예: "음성 통화" / "영상 통화" */
  kindLabel: string;
  /** 예: "취소됨" / "부재중" / "03:42" */
  resultLabel: string;
  /** 타임라인·목록 한 줄 */
  fullLabel: string;
  /** 목록 preview (카톡·텔레그램식) */
  listPreview: string;
  isMissed: boolean;
  isTerminal: boolean;
};

function kindLabel(kind: CommunityMessengerCallKind): string {
  return kind === "video" ? "영상 통화" : "음성 통화";
}

/**
 * 세션 해석 이벤트 + viewer 역할 → canonical.
 * `cancelled` 는 발신자 기준 취소; 수신 viewer 는 incoming_missed 로 본다.
 */
export function resolveCallEventCanonical(input: {
  resolvedEvent: CallSessionResolvedEvent | null;
  callStatusFallback?: CommunityMessengerCallStatus | string | null;
  viewerRole: CallSessionViewerRole | null;
}): CallEventCanonicalResult {
  const ev = input.resolvedEvent;
  const role = input.viewerRole;
  const fs =
    typeof input.callStatusFallback === "string" ? input.callStatusFallback.trim().toLowerCase() : "";

  if (ev === "outgoing_started" || fs === "dialing") return "outgoing_started";
  if (ev === "incoming_received" || fs === "incoming") return "incoming_received";
  if (ev === "peer_busy") return "remote_busy";
  if (ev === "ended" || fs === "ended") return "connected_ended";
  if (ev === "rejected_by_callee" || fs === "rejected") {
    return role === "callee" ? "local_rejected" : "remote_rejected";
  }
  if (ev === "missed" || fs === "missed") {
    return role === "caller" ? "unanswered" : "incoming_missed";
  }
  if (ev === "cancelled_by_caller" || fs === "cancelled") {
    return role === "callee" ? "incoming_missed" : "outgoing_cancelled";
  }
  if (fs === "failed") return "failed";
  return role === "callee" ? "incoming_missed" : "outgoing_cancelled";
}

export function buildCallEventPresentation(input: {
  callKind: CommunityMessengerCallKind;
  canonical: CallEventCanonicalResult;
  durationSeconds?: number | null;
}): CallEventPresentation {
  const kind = kindLabel(input.callKind);
  const dur = Math.max(0, Math.floor(Number(input.durationSeconds ?? 0)));
  const durationText = dur > 0 ? formatCommunityMessengerCallDurationLabel(dur) : "";

  let resultLabel: string;
  let listPreview: string;
  let isMissed = false;
  let isTerminal = true;

  switch (input.canonical) {
    case "outgoing_started":
      resultLabel = "발신 중";
      listPreview = `${kind} · 발신 중`;
      isTerminal = false;
      break;
    case "incoming_received":
      resultLabel = "수신 중";
      listPreview = `${kind} · 수신 중`;
      isTerminal = false;
      break;
    case "connected_ended":
      resultLabel = durationText || "통화 종료";
      listPreview = durationText ? `${kind} · ${durationText}` : `${kind} · 통화 종료`;
      break;
    case "outgoing_cancelled":
      resultLabel = "취소됨";
      listPreview = `${kind} · 취소됨`;
      break;
    case "incoming_missed":
      resultLabel = "부재중";
      listPreview = kind === "영상 통화" ? "부재중 영상 통화" : "부재중 음성 통화";
      isMissed = true;
      break;
    case "remote_rejected":
      resultLabel = "거절됨";
      listPreview = `${kind} · 거절됨`;
      break;
    case "local_rejected":
      resultLabel = "거절함";
      listPreview = `${kind} · 거절함`;
      break;
    case "remote_busy":
      resultLabel = "통화 중";
      listPreview = `${kind} · 통화 중`;
      break;
    case "unanswered":
      resultLabel = "응답 없음";
      listPreview = `${kind} · 응답 없음`;
      break;
    case "failed":
      resultLabel = "연결 실패";
      listPreview = `${kind} · 연결 실패`;
      break;
    case "interrupted":
      resultLabel = "중단됨";
      listPreview = `${kind} · 중단됨`;
      break;
    default: {
      const _exhaustive: never = input.canonical;
      void _exhaustive;
      resultLabel = "상태 확인 중";
      listPreview = `${kind} · 상태 확인 중`;
      isTerminal = false;
    }
  }

  return {
    canonical: input.canonical,
    kindLabel: kind,
    resultLabel,
    fullLabel: `${kind} · ${resultLabel}`,
    listPreview,
    isMissed,
    isTerminal,
  };
}

/**
 * 타임라인·로컬 stub content — viewer 관점 한 줄.
 */
export function formatCallEventForViewer(input: {
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent | null;
  callStatusFallback?: CommunityMessengerCallStatus | string | null;
  viewerRole: CallSessionViewerRole | null;
  durationSeconds?: number | null;
}): CallEventPresentation {
  const canonical = resolveCallEventCanonical({
    resolvedEvent: input.resolvedEvent,
    callStatusFallback: input.callStatusFallback,
    viewerRole: input.viewerRole,
  });
  return buildCallEventPresentation({
    callKind: input.callKind,
    canonical,
    durationSeconds: input.durationSeconds,
  });
}

/**
 * DB `rooms.last_message` / call_stub.content 저장용 — viewer 비의존 shared 라벨.
 * (목록은 이 문자열을 preview 로 사용; 타임라인은 formatCallEventForViewer 재계산)
 */
export function formatCallEventSharedListLabel(
  callKind: CommunityMessengerCallKind,
  status: CommunityMessengerCallStatus,
  durationSeconds?: number
): string {
  const kind = kindLabel(callKind);
  const dur = Math.max(0, Math.floor(Number(durationSeconds ?? 0)));
  if (status === "ended" && dur > 0) {
    return `${kind} · ${formatCommunityMessengerCallDurationLabel(dur)}`;
  }
  if (status === "missed") {
    return kind === "영상 통화" ? "부재중 영상 통화" : "부재중 음성 통화";
  }
  if (status === "rejected") return `${kind} · 거절됨`;
  if (status === "cancelled") return `${kind} · 취소됨`;
  if (status === "ended") return `${kind} · 통화 종료`;
  if (status === "incoming") return `${kind} · 수신 중`;
  return `${kind} · 발신 중`;
}

/** ISO 시각만 앞으로 이동 (rollback 금지) */
export function forwardOnlyActivityAt(currentIso: string | null | undefined, candidateIso: string | null | undefined): string | null {
  const cur = typeof currentIso === "string" ? currentIso.trim() : "";
  const next = typeof candidateIso === "string" ? candidateIso.trim() : "";
  if (!next) return cur || null;
  if (!cur) return next;
  const curMs = new Date(cur).getTime();
  const nextMs = new Date(next).getTime();
  if (!Number.isFinite(nextMs)) return cur || null;
  if (!Number.isFinite(curMs)) return next;
  return nextMs >= curMs ? next : cur;
}
