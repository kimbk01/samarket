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

export type CallInAppNoticePresentation = "BANNER" | "PERSISTENT_BANNER";

export type CallInAppNoticeSpec = {
  event: CallInAppNoticeEvent;
  severity: CallInAppNoticeSeverity;
  messageKey: MessageKey;
  presentation: CallInAppNoticePresentation;
  /** Auto-dismiss ms; null = persistent until replace/dismiss */
  durationMs: number | null;
  dismissible: boolean;
  priority: number;
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
    messageKey: "cm_ui_call_peer_busy",
    presentation: "BANNER",
    durationMs: 4200,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL,
  },
  peer_declined: {
    event: "peer_declined",
    severity: "TERMINAL",
    messageKey: "cm_ui_peer_declined_call",
    presentation: "BANNER",
    durationMs: 4200,
    dismissible: true,
    priority: CALL_IN_APP_NOTICE_PRIORITY.TERMINAL,
  },
  call_failed: {
    event: "call_failed",
    severity: "ERROR",
    messageKey: "cm_ui_call_start_failed",
    presentation: "BANNER",
    durationMs: 4800,
    dismissible: true,
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
    default: {
      const _exhaustive: never = terminalClass;
      return _exhaustive;
    }
  }
}

/** Map native/server terminal reason tokens → notice event (or null = silent dismiss). */
export function mapTerminalReasonToCallInAppNoticeEvent(
  reason: string | null | undefined
): CallInAppNoticeEvent | null {
  return noticeEventForCallTerminalClass(classifyCallTerminalReason(reason));
}

export function shouldReplaceCallInAppNotice(
  current: CallInAppNoticeSpec | null,
  next: CallInAppNoticeSpec
): boolean {
  if (!current) return true;
  if (current.event === next.event) return true; // dedupe refresh
  return next.priority >= current.priority;
}
