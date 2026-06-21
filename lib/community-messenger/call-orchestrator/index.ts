import {
  clearDibayCallPendingRoute,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import type {
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";
import { clearNativePersistedCallPendingRoute } from "@/lib/push/native/push-route-native-bridge";
import { bridgeDibayCallLogToQa } from "@/lib/call/qa/dibay-call-qa-log-bridge";

export type DibayCallOrchestratorState =
  | "IDLE"
  | "RINGING"
  | "CONNECTING"
  | "CONNECTED"
  | "ENDING"
  | "ENDED";

export type DibayCallOrchestratorAction =
  | "accept"
  | "reject"
  | "cancel"
  | "end"
  | "missed"
  | "timeout";

export type DibayCallLogStep =
  | "call_start"
  | "push_sent"
  | "push_received"
  | "notification_created"
  | "incoming_activity_created"
  | "surface_mounted"
  | "call_client_mounted"
  | "incoming_render"
  | "incoming_accept_click"
  | "accept_click"
  | "accept_start"
  | "accept_success"
  | "accept_failed"
  | "accept_route_prep_enter"
  | "accept_route_completed_enter"
  | "join_deferred_until_server_active"
  | "server_active_confirmed_join_start"
  | "call_route_open_start"
  | "call_route_open_done"
  | "call_route_open_failed"
  | "agora_join_start"
  | "agora_join_success"
  | "remote_joined"
  | "connected"
  | "call_end"
  | "cleanup_start"
  | "cleanup_done"
  | "notification_cancel"
  | "activity_finish"
  | "surface_unmount"
  | "state_end"
  | "join_fail"
  | "timeout"
  | "ring_start"
  | "ring_start_skipped_native_owner"
  | "ring_stop"
  | "ring_timeout"
  | "incoming_received"
  | "incoming_consumed"
  | "native_consumed_hydrate"
  | "incoming_ignored_consumed"
  | "terminal_received"
  | "accept_skip_duplicate"
  | "accept_pending_web"
  | "active_route_replace"
  | "accept_route_direct"
  | "stale_ringing_blocked"
  | "reject_patch_start"
  | "reject_patch_done"
  | "reject_patch_failed"
  | "terminal_event_received"
  | "active_session_create"
  | "active_session_resume_from_native"
  | "task_removed_keep_foreground_service"
  | "notification_resume_route"
  | "call_history_start_lock_acquired"
  | "call_history_start_lock_reused"
  | "call_history_start_blocked_active_call"
  | "active_session_hard_clear"
  | "foreground_service_started"
  | "foreground_service_stopped"
  | "active_call_cleanup_blocked"
  | "active_call_machine_transition_blocked"
  | "active_call_resume_check";

type ActionFlight = {
  action: DibayCallOrchestratorAction;
  startedAt: number;
};

const ACTION_FLIGHT_TTL_MS = 60_000;
const TERMINAL_LATCH_TTL_MS = 5 * 60_000;
const actionFlightsBySessionId = new Map<string, ActionFlight>();
const terminalSessions = new Map<string, number>();
const emittedLogSteps = new Set<string>();

export function normalizeDibayCallSessionId(sessionId: string | null | undefined): string {
  return sessionId?.trim() ?? "";
}

export function isDibayServerTerminalCallStatus(
  status: CommunityMessengerCallSessionStatus | string | null | undefined
): boolean {
  return status === "ended" || status === "rejected" || status === "missed" || status === "cancelled";
}

export function deriveDibayCallOrchestratorState(input: {
  session?: Pick<CommunityMessengerCallSession, "status"> | null;
  joined?: boolean;
  ending?: boolean;
}): DibayCallOrchestratorState {
  if (input.ending) return "ENDING";
  const status = input.session?.status;
  if (!status) return "IDLE";
  if (status === "ringing") return "RINGING";
  if (status === "active") return input.joined ? "CONNECTED" : "CONNECTING";
  if (isDibayServerTerminalCallStatus(status)) return "ENDED";
  return "IDLE";
}

export function logDibayCall(step: DibayCallLogStep, extra: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const sessionId = resolveLogSessionId(extra);
  if (sessionId) {
    const key = `${sessionId}:${step}`;
    if (emittedLogSteps.has(key)) return;
    emittedLogSteps.add(key);
  }
  console.info(`[DIBAY_CALL] ${step}`, {
    step,
    at: Date.now(),
    ...extra,
  });
  bridgeDibayCallLogToQa(step, extra);
}

export function markDibayCallTerminal(sessionId: string | null | undefined, now = Date.now()): void {
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return;
  terminalSessions.set(sid, now);
  actionFlightsBySessionId.delete(sid);
}

export function clearDibayCallTerminal(sessionId: string | null | undefined): void {
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return;
  terminalSessions.delete(sid);
}

export function isDibayCallTerminalLatched(sessionId: string | null | undefined, now = Date.now()): boolean {
  pruneDibayCallOrchestratorRuntime(now);
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return false;
  return terminalSessions.has(sid);
}

export function tryBeginDibayCallAction(
  sessionId: string | null | undefined,
  action: DibayCallOrchestratorAction,
  now = Date.now()
): boolean {
  pruneDibayCallOrchestratorRuntime(now);
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return false;
  if (terminalSessions.has(sid)) return false;
  if (actionFlightsBySessionId.has(sid)) return false;
  actionFlightsBySessionId.set(sid, { action, startedAt: now });
  return true;
}

export function endDibayCallAction(sessionId: string | null | undefined, action?: DibayCallOrchestratorAction): void {
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return;
  const flight = actionFlightsBySessionId.get(sid);
  if (!flight) return;
  if (action && flight.action !== action) return;
  actionFlightsBySessionId.delete(sid);
}

export function completeDibayCallAction(
  sessionId: string | null | undefined,
  action: DibayCallOrchestratorAction
): void {
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return;
  actionFlightsBySessionId.delete(sid);
  if (action !== "accept") {
    markDibayCallTerminal(sid);
  }
}

export function isDibayCallActionInFlight(
  sessionId: string | null | undefined,
  action?: DibayCallOrchestratorAction,
  now = Date.now()
): boolean {
  pruneDibayCallOrchestratorRuntime(now);
  const sid = normalizeDibayCallSessionId(sessionId);
  if (!sid) return false;
  const flight = actionFlightsBySessionId.get(sid);
  if (!flight) return false;
  if (action) return flight.action === action;
  return true;
}

export function resetDibayCallActionFlights(sessionId?: string | null): void {
  if (sessionId) {
    actionFlightsBySessionId.delete(normalizeDibayCallSessionId(sessionId));
    return;
  }
  actionFlightsBySessionId.clear();
}

export function extractDibayCallSessionIdFromPath(path: string | null | undefined): string | null {
  const raw = path?.trim();
  if (!raw) return null;
  const match = raw.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const encoded = match?.[1]?.trim();
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function shouldAllowDibayCallRoute(path: string | null | undefined, now = Date.now()): boolean {
  const sessionId = extractDibayCallSessionIdFromPath(path);
  if (!sessionId) return false;
  return !isDibayCallTerminalLatched(sessionId, now);
}

/** 종료 확정 — stale pending route 재생·수신 UI 재진입 차단 */
export function sealDibayCallTerminalSurface(sessionId: string | null | undefined, now = Date.now()): void {
  markDibayCallTerminal(sessionId, now);
  if (typeof window === "undefined") return;
  clearDibayCallPendingRoute();
  void clearNativePersistedCallPendingRoute();
}

function pruneDibayCallOrchestratorRuntime(now: number): void {
  for (const [sessionId, flight] of [...actionFlightsBySessionId.entries()]) {
    if (now - flight.startedAt > ACTION_FLIGHT_TTL_MS) {
      actionFlightsBySessionId.delete(sessionId);
    }
  }
  for (const [sessionId, terminalAt] of [...terminalSessions.entries()]) {
    if (now - terminalAt > TERMINAL_LATCH_TTL_MS) {
      terminalSessions.delete(sessionId);
    }
  }
}

function resolveLogSessionId(extra: Record<string, unknown>): string | null {
  const raw = extra.sessionId ?? extra.callId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
