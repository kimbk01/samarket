/**
 * DIBAY CALL IN-APP NOTICE — product contract (transient only).
 * Full call shells / OS CallKit / FSI / FGS are out of scope.
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

/** Map native/server terminal reason tokens → notice event (or null = silent dismiss). */
export function mapTerminalReasonToCallInAppNoticeEvent(
  reason: string | null | undefined
): CallInAppNoticeEvent | null {
  const kind = String(reason ?? "")
    .trim()
    .toLowerCase();
  if (!kind) return null;
  if (
    kind === "peer_busy" ||
    kind === "callee_busy" ||
    kind === "busy" ||
    kind === "native_engine_busy"
  ) {
    return "peer_busy";
  }
  if (kind === "rejected" || kind === "reject" || kind === "declined" || kind === "call_rejected") {
    return "peer_declined";
  }
  if (kind === "failed" || kind === "failed_setup" || kind === "failed_network" || kind.startsWith("agora")) {
    return "call_failed";
  }
  if (
    kind === "ended" ||
    kind === "remote_ended" ||
    kind === "call_ended" ||
    kind === "end" ||
    kind === "local_ended"
  ) {
    return "remote_ended";
  }
  if (kind === "missed" || kind === "missed_call" || kind === "call_missed" || kind === "timeout") {
    return "missed";
  }
  if (kind.includes("permission") || kind.includes("mic") || kind.includes("camera")) {
    return "permission_required";
  }
  // cancelled / answered_elsewhere → no transient notice (shell already ending)
  return null;
}

export function shouldReplaceCallInAppNotice(
  current: CallInAppNoticeSpec | null,
  next: CallInAppNoticeSpec
): boolean {
  if (!current) return true;
  if (current.event === next.event) return true; // dedupe refresh
  return next.priority >= current.priority;
}
