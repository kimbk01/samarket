/**
 * DIBAY CALL IN-APP NOTICE — product contract (transient only).
 * Full call shells / OS CallKit / FSI / FGS are out of scope.
 *
 * Terminal classification SSOT:
 * RAW reason → CallTerminalClass → UI policy (notice event or silent dismiss).
 * Notice writers must consume class/event — not re-parse raw strings.
 */

import type { MessageKey } from "@/lib/i18n/messages";

export const CALL_IN_APP_NOTICE_EVENTS = [
  "peer_busy",
  "call_failed",
  "reconnecting",
  "remote_ended",
  "missed",
  "permission_required",
  "network_warning",
  "peer_declined",
  /** Owner 2026-10-21 — 발신자 관점 무응답(수신자 `missed` 알림과 구분) */
  "peer_no_answer",
  /** 서버가 전달 가능한 기기 0대 + 수신 확인 없음을 증명한 경우에만 (3부 T절 #4) */
  "peer_unreachable",
  /** 연결 후 재연결 실패·비정상 끊김 */
  "call_disconnected",
  /** 발신자 자신의 다른 통화가 진행 중 (C-17 — 상대 busy 와 구분) */
  "self_busy",
] as const;

export type CallInAppNoticeEvent = (typeof CALL_IN_APP_NOTICE_EVENTS)[number];

/** Canonical terminal class (iOS `NativeCallInAppNotice.CallTerminalClass` parity). */
export const CALL_TERMINAL_CLASSES = [
  "NORMAL_ENDED",
  "PEER_BUSY",
  "PEER_DECLINED",
  "ACTIONABLE_FAILURE",
  "PERMISSION_REQUIRED",
  "MISSED",
  "NO_ANSWER",
  "UNREACHABLE",
  "DISCONNECTED",
  "SELF_BUSY",
  "NONE",
] as const;

export type CallTerminalClass = (typeof CALL_TERMINAL_CLASSES)[number];

export type CallInAppNoticeSeverity =
  | "INFORMATION"
  | "PROGRESS"
  | "WARNING"
  | "ERROR"
  | "TERMINAL"
  | "ACTION_REQUIRED";

/**
 * DIALOG — 중요한 통화 실패는 중앙 공통 경고 팝업(제목·설명·[닫기]·재시도 가능 시 [다시 걸기]).
 * BANNER — 진행·경고·정보(재연결 중·네트워크 경고·수신자 부재중 알림). 일시 저하는 모달을 쓰지 않는다.
 */
export type CallInAppNoticePresentation = "BANNER" | "PERSISTENT_BANNER" | "DIALOG";

export type CallInAppNoticeSpec = {
  event: CallInAppNoticeEvent;
  severity: CallInAppNoticeSeverity;
  messageKey: MessageKey;
  presentation: CallInAppNoticePresentation;
  /** Auto-dismiss ms; null = persistent until replace/dismiss */
  durationMs: number | null;
  dismissible: boolean;
  priority: number;
  /** DIALOG 제목 — 없으면 본문만 */
  titleKey?: MessageKey;
  /** [다시 걸기] 노출 (이전 세션 정리 완료 후 실행) */
  retryable?: boolean;
};

/** Higher number wins. TERMINAL > ERROR > ACTION_REQUIRED > WARNING > PROGRESS > INFORMATION */
export const CALL_IN_APP_NOTICE_PRIORITY: Record<CallInAppNoticeSeverity, number> = {
  TERMINAL: 600,
  ERROR: 500,
  ACTION_REQUIRED: 400,
  WARNING: 300,
  PROGRESS: 200,
  INFORMATION: 100,
};

/**
 * Live event → notice mapping (locked to existing product events / catalog keys).
 * `connecting` / first dialing shell status are NOT notices (fullscreen shell owns them).
 */
export const CALL_IN_APP_NOTICE_SPECS: Record<CallInAppNoticeEvent, CallInAppNoticeSpec> = {
  peer_busy: {
    event: "peer_busy",
    severity: "TERMINAL",
    messageKey: "cm_ui_call_alert_peer_busy_body",
    titleKey: "cm_ui_call_alert_peer_busy_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL,
  },
  peer_declined: {
    event: "peer_declined",
    severity: "TERMINAL",
    messageKey: "cm_ui_call_alert_declined_body",
    titleKey: "cm_ui_call_alert_declined_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL,
  },
  call_failed: {
    event: "call_failed",
    severity: "ERROR",
    messageKey: "cm_ui_call_alert_failed_body",
    titleKey: "cm_ui_call_alert_failed_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.ERROR,
  },
  peer_no_answer: {
    event: "peer_no_answer",
    severity: "TERMINAL",
    messageKey: "cm_ui_call_alert_no_answer_body",
    titleKey: "cm_ui_call_alert_no_answer_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    /** 실패·거절보다 낮게 — 같은 통화에서 더 구체적인 사유가 오면 교체 */
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL - 50,
  },
  peer_unreachable: {
    event: "peer_unreachable",
    severity: "ERROR",
    messageKey: "cm_ui_call_alert_unreachable_body",
    titleKey: "cm_ui_call_alert_failed_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL - 40,
  },
  call_disconnected: {
    event: "call_disconnected",
    severity: "ERROR",
    messageKey: "cm_ui_call_alert_disconnected_body",
    titleKey: "cm_ui_call_alert_disconnected_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.ERROR,
  },
  self_busy: {
    event: "self_busy",
    severity: "ERROR",
    messageKey: "cm_ui_call_alert_self_busy_body",
    titleKey: "cm_ui_call_alert_self_busy_title",
    presentation: "DIALOG",
    durationMs: null,
    dismissible: true,
    retryable: false,
    priority: CALL_IN_APP_NOTICE_PRIORITY.ERROR,
  },
  remote_ended: {
    event: "remote_ended",
    severity: "TERMINAL",
    messageKey: "cm_ui_call_ended",
    presentation: "BANNER",
    durationMs: 3600,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL,
  },
  missed: {
    event: "missed",
    severity: "INFORMATION",
    messageKey: "cm_ui_missed_call_notification",
    presentation: "BANNER",
    durationMs: 4200,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.INFORMATION,
  },
  reconnecting: {
    event: "reconnecting",
    severity: "PROGRESS",
    messageKey: "cm_ui_call_reconnecting",
    presentation: "PERSISTENT_BANNER",
    durationMs: null,
    dismissible: false,
    priority: CALL_IN_APP_NOTICE_PRIORITY.PROGRESS,
  },
  network_warning: {
    event: "network_warning",
    severity: "WARNING",
    messageKey: "cm_ui_call_failed_network_detail",
    presentation: "BANNER",
    durationMs: 4200,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.WARNING,
  },
  permission_required: {
    event: "permission_required",
    severity: "ACTION_REQUIRED",
    messageKey: "cm_ui_mic_permission_required",
    presentation: "PERSISTENT_BANNER",
    durationMs: null,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.ACTION_REQUIRED,
  },
};

export function getCallInAppNoticeSpec(event: CallInAppNoticeEvent): CallInAppNoticeSpec {
  return CALL_IN_APP_NOTICE_SPECS[event];
}

/** RAW terminal reason → canonical class. */
export function classifyCallTerminalReason(
  reason: string | null | undefined
): CallTerminalClass {
  const kind = String(reason ?? "")
    .trim()
    .toLowerCase();
  if (!kind) return "NONE";
  if (
    kind === "peer_busy" ||
    kind === "callee_busy" ||
    kind === "busy" ||
    kind === "native_engine_busy"
  ) {
    return "PEER_BUSY";
  }
  if (kind === "rejected" || kind === "reject" || kind === "declined" || kind === "call_rejected") {
    return "PEER_DECLINED";
  }
  if (
    kind === "ended" ||
    kind === "remote_ended" ||
    kind === "call_ended" ||
    kind === "end" ||
    kind === "local_ended" ||
    kind === "remote_terminal"
  ) {
    return "NORMAL_ENDED";
  }
  if (kind === "self_busy") return "SELF_BUSY";
  if (kind === "unreachable" || kind === "peer_unreachable") return "UNREACHABLE";
  /** 발신자 관점 무응답 — 수신자 `missed` 와 구분 (Owner 2026-10-21: 「상대방이 응답하지 않습니다」) */
  if (kind === "no_answer" || kind === "peer_no_answer" || kind === "unanswered") return "NO_ANSWER";
  if (
    kind === "disconnected" ||
    kind === "heartbeat_timeout" ||
    kind === "peer_dropped" ||
    kind === "link_lost" ||
    kind === "reconcile_stale_active" ||
    kind === "call_disconnected"
  ) {
    return "DISCONNECTED";
  }
  if (kind === "missed" || kind === "missed_call" || kind === "call_missed" || kind === "timeout") {
    return "MISSED";
  }
  if (kind.includes("permission") || kind.includes("mic") || kind.includes("camera")) {
    return "PERMISSION_REQUIRED";
  }
  if (
    kind === "failed" ||
    kind === "failed_setup" ||
    kind === "failed_network" ||
    /** 3부 T절 #6 — ice·signaling·insecure_context 등 연결 중 실패 전부 */
    kind.startsWith("failed_") ||
    kind.startsWith("agora") ||
    kind.includes("token") ||
    kind.includes("join") ||
    kind.includes("media") ||
    kind.includes("accept")
  ) {
    return "ACTIONABLE_FAILURE";
  }
  // cancelled / answered_elsewhere → silent (shell already ending)
  return "NONE";
}

/** CLASS → notice event (null = SILENT_DISMISS). */
export function noticeEventForCallTerminalClass(
  terminalClass: CallTerminalClass
): CallInAppNoticeEvent | null {
  switch (terminalClass) {
    case "NORMAL_ENDED":
    case "NONE":
      return null;
    case "PEER_BUSY":
      return "peer_busy";
    case "PEER_DECLINED":
      return "peer_declined";
    case "ACTIONABLE_FAILURE":
      return "call_failed";
    case "PERMISSION_REQUIRED":
      return "permission_required";
    case "MISSED":
      return "missed";
    case "NO_ANSWER":
      return "peer_no_answer";
    case "UNREACHABLE":
      return "peer_unreachable";
    case "DISCONNECTED":
      return "call_disconnected";
    case "SELF_BUSY":
      return "self_busy";
    default: {
      const _exhaustive: never = terminalClass;
      return _exhaustive;
    }
  }
}

/** Map native/server terminal reason tokens → notice event (or null = silent dismiss). */
export function mapTerminalReasonToCallInAppNoticeEvent(
  reason: string | null | undefined,
  opts?: { direction?: "outgoing" | "incoming" | null }
): CallInAppNoticeEvent | null {
  const cls = classifyCallTerminalReason(reason);
  /** 링잉 마감(missed)을 **발신자**가 받으면 「응답하지 않습니다」, 수신자는 기존 부재중 알림 */
  if (cls === "MISSED" && opts?.direction === "outgoing") return "peer_no_answer";
  return noticeEventForCallTerminalClass(cls);
}

/** 팝업 행 여부 (T절 #2·#3·#4·#5·#6·#10) */
export function isCallAlertDialogEvent(event: CallInAppNoticeEvent): boolean {
  return CALL_IN_APP_NOTICE_SPECS[event].presentation === "DIALOG";
}

export function shouldReplaceCallInAppNotice(
  current: CallInAppNoticeSpec | null,
  next: CallInAppNoticeSpec
): boolean {
  if (!current) return true;
  if (current.event === next.event) return true; // dedupe refresh
  return next.priority >= current.priority;
}
