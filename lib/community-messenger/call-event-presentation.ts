/**
 * 통화 이벤트 표시 SSOT — raw terminal reason / DB status → canonical → viewer 문구.
 * UI·목록·DB content writer 는 이 모듈만 사용한다 (문자열 substring 판별 금지).
 * 언어 SSOT 6번 (Owner 2026-11-08 승인): 화면 문구는 `lang` 으로 카탈로그 키에서 만든다. DB 저장 문장
 * (`formatCallEventSharedListLabel`)만 한국어 고정 — 저장 형식·토큰 무변경.
 */
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallStatus,
} from "@/lib/community-messenger/types";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
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
  | "self_busy"
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

function kindLabel(kind: CommunityMessengerCallKind, lang: AppLanguageCode): string {
  return translate(lang, kind === "video" ? "cm_home_call_video" : "cm_home_call_voice");
}

function line(lang: AppLanguageCode, kind: string, resultKey: MessageKey): string {
  return translate(lang, "cm_call_line", { kind, result: translate(lang, resultKey) });
}

function missedLine(lang: AppLanguageCode, callKind: CommunityMessengerCallKind): string {
  return translate(lang, callKind === "video" ? "cm_call_missed_video" : "cm_call_missed_voice");
}

/**
 * 세션 해석 이벤트 + viewer 역할 → canonical.
 * 종료 결과는 통화 결과 기준(제품 결정 2026-10-16)이되, **발신자 취소만 보는 사람에 따라 나눈다**
 * (Owner 2026-11-13 「발신 후 수신 전 취소 하면 발신자는 취소, 수신자는 부재중」 · 레거시 텔레그램 동일 —
 * docs/audit/call-cancel-callee-missed-design-2026-11-13.md D1):
 * - 수신자가 받지 않음(시간 초과) → 부재중 (`incoming_missed`) — 발신자·수신자 동일
 * - 수신자가 거절 → 거절 (`remote_rejected`) — 동일
 * - 발신자가 취소 → 발신자 취소 (`outgoing_cancelled`) / **수신자 부재중** (`incoming_missed`)
 * 진행 중(발신 중/수신 중)도 역할로 구분한다. 보는 사람을 모르면(null) 발신자 취소는 취소.
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

  if (ev === "outgoing_started") return "outgoing_started";
  if (ev === "incoming_received") return "incoming_received";
  /** dialing shared status alone is not direction — viewer role decides. */
  if (fs === "dialing") {
    if (role === "callee") return "incoming_received";
    return "outgoing_started";
  }
  if (fs === "incoming") return "incoming_received";
  if (ev === "peer_busy") return "remote_busy";
  if (ev === "caller_busy") return "self_busy";
  if (ev === "failed") return "failed";
  if (ev === "disconnected") return "interrupted";
  if (ev === "ended" || fs === "ended") return "connected_ended";
  if (ev === "rejected_by_callee" || fs === "rejected") return "remote_rejected";
  if (ev === "missed" || fs === "missed") return "incoming_missed";
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
  lang: AppLanguageCode;
}): CallEventPresentation {
  const lang = input.lang;
  const kind = kindLabel(input.callKind, lang);
  const dur = Math.max(0, Math.floor(Number(input.durationSeconds ?? 0)));
  const durationText = dur > 0 ? formatCommunityMessengerCallDurationLabel(dur, lang) : "";
  const r = (key: MessageKey) => translate(lang, key);

  let resultLabel: string;
  let listPreview: string;
  let isMissed = false;
  let isTerminal = true;

  switch (input.canonical) {
    case "outgoing_started":
      resultLabel = r("cm_call_result_calling");
      listPreview = line(lang, kind, "cm_call_result_calling");
      isTerminal = false;
      break;
    case "incoming_received":
      resultLabel = r("cm_call_result_incoming");
      listPreview = line(lang, kind, "cm_call_result_incoming");
      isTerminal = false;
      break;
    case "connected_ended":
      resultLabel = durationText || r("cm_call_result_ended");
      listPreview = durationText ?
          translate(lang, "cm_call_line", { kind, result: durationText })
        : line(lang, kind, "cm_call_result_ended");
      break;
    case "outgoing_cancelled":
      resultLabel = r("cm_call_result_cancelled");
      listPreview = line(lang, kind, "cm_call_result_cancelled");
      break;
    case "incoming_missed":
    case "unanswered":
      resultLabel = r("cm_call_result_missed");
      listPreview = missedLine(lang, input.callKind);
      isMissed = true;
      break;
    case "remote_rejected":
    case "local_rejected":
      resultLabel = r("cm_call_result_declined");
      listPreview = line(lang, kind, "cm_call_result_declined");
      break;
    case "remote_busy":
      resultLabel = r("cm_call_result_busy");
      listPreview = line(lang, kind, "cm_call_result_busy");
      break;
    case "self_busy":
      resultLabel = r("cm_call_result_self_busy");
      listPreview = line(lang, kind, "cm_call_result_self_busy");
      break;
    case "failed":
      resultLabel = r("cm_call_result_failed");
      listPreview = line(lang, kind, "cm_call_result_failed");
      break;
    case "interrupted":
      resultLabel = r("cm_call_result_interrupted");
      listPreview = line(lang, kind, "cm_call_result_interrupted");
      break;
    default: {
      const _exhaustive: never = input.canonical;
      void _exhaustive;
      resultLabel = r("cm_call_result_checking");
      listPreview = line(lang, kind, "cm_call_result_checking");
      isTerminal = false;
    }
  }

  return {
    canonical: input.canonical,
    kindLabel: kind,
    resultLabel,
    fullLabel: translate(lang, "cm_call_line", { kind, result: resultLabel }),
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
  lang: AppLanguageCode;
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
    lang: input.lang,
  });
}

/**
 * DB `rooms.last_message` / call_stub.content 저장용 — viewer 비의존 shared 라벨.
 * (목록은 이 문자열을 preview 로 사용; 타임라인은 formatCallEventForViewer 재계산)
 * CUT4: optional resolvedEvent distinguishes failed / disconnected from generic ended.
 */
export function formatCallEventSharedListLabel(
  callKind: CommunityMessengerCallKind,
  status: CommunityMessengerCallStatus,
  durationSeconds?: number,
  resolvedEvent?: CallSessionResolvedEvent | null,
): string {
  /** DB 저장 문장 — 보는 사람과 무관한 한국어 고정(저장 형식 무변경). 화면은 토큰·metadata 로 다시 그린다. */
  const lang: AppLanguageCode = "ko";
  const kind = kindLabel(callKind, lang);
  const dur = Math.max(0, Math.floor(Number(durationSeconds ?? 0)));
  if (resolvedEvent === "failed") return line(lang, kind, "cm_call_result_failed");
  if (resolvedEvent === "disconnected") return line(lang, kind, "cm_call_result_disconnected");
  if (resolvedEvent === "peer_busy") return line(lang, kind, "cm_call_result_busy");
  if (resolvedEvent === "caller_busy") return line(lang, kind, "cm_call_result_self_busy");
  if ((resolvedEvent === "ended" || status === "ended") && dur > 0) {
    return translate(lang, "cm_call_line", { kind, result: formatCommunityMessengerCallDurationLabel(dur, lang) });
  }
  if (resolvedEvent === "missed" || status === "missed") return missedLine(lang, callKind);
  if (resolvedEvent === "rejected_by_callee" || status === "rejected") return line(lang, kind, "cm_call_result_declined");
  if (resolvedEvent === "cancelled_by_caller" || status === "cancelled") return line(lang, kind, "cm_call_result_cancelled");
  if (resolvedEvent === "ended" || status === "ended") return line(lang, kind, "cm_call_result_ended");
  if (status === "incoming") return line(lang, kind, "cm_call_result_incoming");
  return line(lang, kind, "cm_call_result_calling");
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
