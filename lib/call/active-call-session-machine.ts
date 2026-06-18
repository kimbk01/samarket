/**
 * P4 Active Call Session — machine phases + cleanup reason SSOT.
 * Native Android/iOS managers mirror these string constants.
 */

import type { ActiveCallSessionPhase } from "@/lib/call/active-call-session";

/** Machine phase — session owns call lifecycle; UI is presenter only */
export type ActiveCallSessionMachinePhase =
  | "IDLE"
  | "ACCEPTED"
  | "JOINING_MEDIA"
  | "CONNECTED"
  | "BACKGROUNDED"
  | "SCREEN_OFF_ACTIVE"
  | "PIP_ACTIVE"
  | "REENTERING"
  | "RECONNECTING"
  | "LOCAL_ENDING"
  | "REMOTE_ENDED"
  | "MEDIA_FAILED"
  | "CLEANED";

export type AllowedCleanupReason =
  | "local_ended"
  | "remote_ended"
  | "media_failed_after_connected"
  | "network_timeout_after_reconnect"
  | "force_killed_confirmed"
  | "permission_revoked_after_accept"
  | "heartbeat_timeout"
  | "terminal"
  | "ended"
  | "rejected"
  | "cancelled"
  | "missed"
  | "failed"
  | "native_stale_terminal"
  | "recovery_no_live_session"
  | "client_end"
  | "notification_end";

export type ForbiddenCleanupReason =
  | "activity_destroyed"
  | "webview_reload"
  | "notification_dismissed"
  | "screen_off"
  | "backgrounded"
  | "unknown"
  | "app_swipe";

export type ActiveCallCleanupReason = AllowedCleanupReason | ForbiddenCleanupReason | string;

const FORBIDDEN_CLEANUP_REASONS = new Set<string>([
  "activity_destroyed",
  "webview_reload",
  "notification_dismissed",
  "screen_off",
  "backgrounded",
  "unknown",
  "app_swipe",
]);

const LIVE_MACHINE_PHASES = new Set<ActiveCallSessionMachinePhase>([
  "ACCEPTED",
  "JOINING_MEDIA",
  "CONNECTED",
  "BACKGROUNDED",
  "SCREEN_OFF_ACTIVE",
  "PIP_ACTIVE",
  "REENTERING",
  "RECONNECTING",
  "LOCAL_ENDING",
]);

const TERMINAL_MACHINE_PHASES = new Set<ActiveCallSessionMachinePhase>([
  "REMOTE_ENDED",
  "MEDIA_FAILED",
  "CLEANED",
  "IDLE",
]);

/** Connected-ish phases — call must not end on screen off / background / activity destroy */
export const CONNECTED_KEEP_ALIVE_PHASES = new Set<ActiveCallSessionMachinePhase>([
  "CONNECTED",
  "BACKGROUNDED",
  "SCREEN_OFF_ACTIVE",
  "PIP_ACTIVE",
  "RECONNECTING",
]);

export function isLiveMachinePhase(phase: ActiveCallSessionMachinePhase | null | undefined): boolean {
  return phase != null && LIVE_MACHINE_PHASES.has(phase);
}

export function isConnectedKeepAlivePhase(phase: ActiveCallSessionMachinePhase | null | undefined): boolean {
  return phase != null && CONNECTED_KEEP_ALIVE_PHASES.has(phase);
}

export function isTerminalMachinePhase(phase: ActiveCallSessionMachinePhase | null | undefined): boolean {
  return phase != null && TERMINAL_MACHINE_PHASES.has(phase);
}

export function canCleanupActiveCall(reason: ActiveCallCleanupReason): boolean {
  const normalized = reason.trim().toLowerCase();
  if (!normalized) return false;
  if (FORBIDDEN_CLEANUP_REASONS.has(normalized)) return false;
  return true;
}

export function isForbiddenCleanupReason(reason: ActiveCallCleanupReason): boolean {
  return !canCleanupActiveCall(reason);
}

const TRANSITIONS: Record<ActiveCallSessionMachinePhase, Set<ActiveCallSessionMachinePhase>> = {
  IDLE: new Set(["ACCEPTED", "JOINING_MEDIA", "CONNECTED", "CLEANED"]),
  ACCEPTED: new Set(["JOINING_MEDIA", "CONNECTED", "LOCAL_ENDING", "REMOTE_ENDED", "MEDIA_FAILED", "CLEANED"]),
  JOINING_MEDIA: new Set(["CONNECTED", "RECONNECTING", "LOCAL_ENDING", "REMOTE_ENDED", "MEDIA_FAILED", "CLEANED"]),
  CONNECTED: new Set([
    "BACKGROUNDED",
    "SCREEN_OFF_ACTIVE",
    "PIP_ACTIVE",
    "REENTERING",
    "RECONNECTING",
    "LOCAL_ENDING",
    "REMOTE_ENDED",
    "MEDIA_FAILED",
    "CLEANED",
  ]),
  BACKGROUNDED: new Set([
    "CONNECTED",
    "SCREEN_OFF_ACTIVE",
    "PIP_ACTIVE",
    "REENTERING",
    "RECONNECTING",
    "LOCAL_ENDING",
    "REMOTE_ENDED",
    "CLEANED",
  ]),
  SCREEN_OFF_ACTIVE: new Set([
    "CONNECTED",
    "BACKGROUNDED",
    "PIP_ACTIVE",
    "REENTERING",
    "RECONNECTING",
    "LOCAL_ENDING",
    "REMOTE_ENDED",
    "CLEANED",
  ]),
  PIP_ACTIVE: new Set([
    "CONNECTED",
    "BACKGROUNDED",
    "REENTERING",
    "LOCAL_ENDING",
    "REMOTE_ENDED",
    "CLEANED",
  ]),
  REENTERING: new Set(["CONNECTED", "JOINING_MEDIA", "RECONNECTING", "LOCAL_ENDING", "REMOTE_ENDED", "CLEANED"]),
  RECONNECTING: new Set(["CONNECTED", "JOINING_MEDIA", "LOCAL_ENDING", "REMOTE_ENDED", "MEDIA_FAILED", "CLEANED"]),
  LOCAL_ENDING: new Set(["CLEANED", "REMOTE_ENDED"]),
  REMOTE_ENDED: new Set(["CLEANED"]),
  MEDIA_FAILED: new Set(["CLEANED", "LOCAL_ENDING"]),
  CLEANED: new Set(["IDLE"]),
};

export function canTransitionMachinePhase(
  from: ActiveCallSessionMachinePhase,
  to: ActiveCallSessionMachinePhase,
): boolean {
  if (from === to) return true;
  const allowed = TRANSITIONS[from];
  return allowed?.has(to) ?? false;
}

export function transitionMachinePhase(
  current: ActiveCallSessionMachinePhase,
  next: ActiveCallSessionMachinePhase,
): ActiveCallSessionMachinePhase {
  if (canTransitionMachinePhase(current, next)) return next;
  return current;
}

/** Legacy UI phase → machine phase (best-effort) */
export function mapLegacyPhaseToMachine(
  phase: ActiveCallSessionPhase,
  joined = false,
): ActiveCallSessionMachinePhase {
  switch (phase) {
    case "idle":
      return "IDLE";
    case "dialing":
    case "ringing":
      return "ACCEPTED";
    case "connecting":
      return joined ? "JOINING_MEDIA" : "ACCEPTED";
    case "active":
      return joined ? "CONNECTED" : "JOINING_MEDIA";
    case "ending":
      return "LOCAL_ENDING";
    case "ended":
      return "REMOTE_ENDED";
    case "missed":
    case "failed":
      return "MEDIA_FAILED";
    default:
      return "IDLE";
  }
}

/** Machine phase → legacy UI phase for existing consumers */
export function mapMachinePhaseToLegacy(phase: ActiveCallSessionMachinePhase): ActiveCallSessionPhase {
  switch (phase) {
    case "IDLE":
    case "CLEANED":
      return "idle";
    case "ACCEPTED":
      return "ringing";
    case "JOINING_MEDIA":
      return "connecting";
    case "CONNECTED":
    case "BACKGROUNDED":
    case "SCREEN_OFF_ACTIVE":
    case "PIP_ACTIVE":
    case "REENTERING":
    case "RECONNECTING":
      return "active";
    case "LOCAL_ENDING":
      return "ending";
    case "REMOTE_ENDED":
      return "ended";
    case "MEDIA_FAILED":
      return "failed";
    default:
      return "idle";
  }
}

export function normalizeCleanupReasonForMachine(reason: string): AllowedCleanupReason | ForbiddenCleanupReason {
  const r = reason.trim().toLowerCase();
  if (FORBIDDEN_CLEANUP_REASONS.has(r)) return r as ForbiddenCleanupReason;
  if (r === "heartbeat_timeout") return "heartbeat_timeout";
  if (r === "remote_ended" || r === "ended" || r === "rejected" || r === "cancelled") return "remote_ended";
  if (r === "local_ended" || r === "client_end" || r === "notification_end") return "local_ended";
  if (r.startsWith("failed_") || r === "failed") return "media_failed_after_connected";
  if (r === "native_stale_terminal" || r === "recovery_no_live_session") return r as AllowedCleanupReason;
  if (canCleanupActiveCall(r)) return r as AllowedCleanupReason;
  return "unknown";
}
