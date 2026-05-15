"use client";

import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import { noteCmRoomSubtreeAttach } from "@/lib/community-messenger/room/cm-room-subtree-stability";

/** emit age / tap 기준 stale (sanitize) */
export const CM_ROOM_ENTRY_TAP_TTL_MS = 3000;
/** completed·reuse 허용 창 */
export const CM_ROOM_SESSION_REUSE_TTL_MS = 15_000;
/** PASS2 freeze 후 session map 유지 */
export const CM_ROOM_SESSION_POST_FREEZE_HOLD_MS = 3000;
/** strict mode double-invoke 억제 */
const CM_ROOM_STRICT_MODE_BEGIN_GUARD_MS = 120;

export type CmRoomEntryTimingSessionStatus = "active" | "completed" | "expired" | "cleared";

export type CmRoomTimingMetric =
  | "shell"
  | "header_seed"
  | "message_seed"
  | "message_viewport"
  | "composer"
  | "pass0_shell"
  | "pass1_header_composer"
  | "pass2_viewport"
  | "pre_route_shell"
  | "entry_stage"
  | "timing_v2"
  | "pass_render";

export type CmRoomEntryTimingAcquireReason =
  | "nav_tap"
  | "route_t0_fallback"
  | "subtree_mount"
  | "room_id_change"
  | "explicit_reopen"
  | "ttl_expire"
  | "hard_refresh"
  | "strict_mode_reuse"
  | "session_reuse";

type CmRoomEntryTimingSession = {
  sessionId: string;
  roomId: string;
  startedAt: number;
  tapT0: number;
  status: CmRoomEntryTimingSessionStatus;
  completedAt: number;
  frozen: boolean;
  droppedEmits: number;
  completedMetrics: Set<CmRoomTimingMetric>;
  stages: {
    shell: number;
    header_seed: number;
    message_seed: number;
    message_viewport: number;
    composer: number;
  };
  stageLogEmitted: boolean;
  timingV2Emitted: boolean;
  explicitCloseAt: number;
  mountGeneration: number;
};

const activeRoomSessions = new Map<string, CmRoomEntryTimingSession>();
let activeSessionRoomId: string | null = null;
let sessionSeq = 0;
const pendingCleanups = new Set<() => void>();
const scheduledSessionClears = new Map<string, number>();
const roomMountGenerations = new Map<string, number>();
const recentAcquireAtByRoom = new Map<string, number>();
const explicitClosedRoomIds = new Set<string>();

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function newSessionId(): string {
  sessionSeq += 1;
  return `cmre-${Date.now().toString(36)}-${sessionSeq}`;
}

function sessionAgeMs(session: CmRoomEntryTimingSession): number {
  return Math.round(perfNow() - session.startedAt);
}

function isSessionReuseExpired(session: CmRoomEntryTimingSession): boolean {
  return perfNow() - session.startedAt > CM_ROOM_SESSION_REUSE_TTL_MS;
}

function isSessionTapEmitExpired(session: CmRoomEntryTimingSession): boolean {
  return perfNow() - session.tapT0 > CM_ROOM_ENTRY_TAP_TTL_MS;
}

function setActiveSessionPointer(session: CmRoomEntryTimingSession | null): void {
  if (!session) {
    activeSessionRoomId = null;
    return;
  }
  activeSessionRoomId = session.roomId;
  activeRoomSessions.set(session.roomId, session);
}

function getActiveSession(): CmRoomEntryTimingSession | null {
  if (!activeSessionRoomId) return null;
  return activeRoomSessions.get(activeSessionRoomId) ?? null;
}

function getSessionForRoom(roomId: string): CmRoomEntryTimingSession | null {
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  return activeRoomSessions.get(id) ?? null;
}

function resolveSession(roomId?: string): CmRoomEntryTimingSession | null {
  const id = String(roomId ?? "").trim();
  if (id) return getSessionForRoom(id);
  return getActiveSession();
}

function logTimingSession(session: CmRoomEntryTimingSession): void {
  // eslint-disable-next-line no-console -- timing session diagnostics
  console.log("[cm-room-timing-session]", {
    roomId: session.roomId,
    sessionId: session.sessionId,
    status: session.status,
    startedAt: Math.round(session.startedAt),
    completedAt: session.completedAt > 0 ? Math.round(session.completedAt) : null,
    expired: session.status === "expired",
    dropped_emits: session.droppedEmits,
    completed_metrics: Array.from(session.completedMetrics),
    mount_generation: session.mountGeneration,
  });
}

function logTimingStaleDrop(payload: {
  roomId: string;
  sessionId: string;
  activeSessionId: string | null;
  metric: CmRoomTimingMetric;
  age_ms: number | null;
  reason: string;
}): void {
  // eslint-disable-next-line no-console -- stale timing drop diagnostics
  console.log("[cm-timing-stale-drop]", payload);
}

function logSessionReuse(payload: {
  roomId: string;
  existingSessionId: string;
  requestedReason: string;
  reused: boolean;
  sessionAgeMs: number;
}): void {
  // eslint-disable-next-line no-console -- session reuse diagnostics
  console.log("[cm-room-session-reuse]", payload);
}

export function logCmRoomRemountDetect(payload: {
  roomId: string;
  previousSessionId: string | null;
  newSessionId: string;
  reason: string;
  componentKeyChanged?: boolean;
  routeKeyChanged?: boolean;
  effectReset?: boolean;
  strictModeDoubleRun?: boolean;
}): void {
  // eslint-disable-next-line no-console -- remount diagnostics
  console.log("[cm-room-remount-detect]", payload);
}

function dropEmit(
  metric: CmRoomTimingMetric,
  reason: string,
  roomId: string,
  sessionId?: string
): void {
  const session = resolveSession(roomId);
  if (session) session.droppedEmits += 1;
  logTimingStaleDrop({
    roomId,
    sessionId: sessionId ?? "",
    activeSessionId: session?.sessionId ?? getActiveSession()?.sessionId ?? null,
    metric,
    age_ms: msSinceSessionTap(sessionId, roomId),
    reason,
  });
}

function isCmRoomRouteTransitionActive(roomId?: string): boolean {
  const s = useCmRoomOpeningOverlayStore.getState();
  const id = String(roomId ?? "").trim();
  if (!id) return s.phase === "overlay" || s.phase === "handoff";
  return s.openingRoomId === id && (s.phase === "overlay" || s.phase === "handoff");
}

function cancelScheduledSessionClear(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const timer = scheduledSessionClears.get(id);
  if (timer != null) {
    clearTimeout(timer);
    scheduledSessionClears.delete(id);
  }
}

function createSession(roomId: string, reason: CmRoomEntryTimingAcquireReason): CmRoomEntryTimingSession {
  const now = perfNow();
  const mountGen = (roomMountGenerations.get(roomId) ?? 0) + 1;
  roomMountGenerations.set(roomId, mountGen);
  const session: CmRoomEntryTimingSession = {
    sessionId: newSessionId(),
    roomId,
    startedAt: now,
    tapT0: now,
    status: "active",
    completedAt: 0,
    frozen: false,
    droppedEmits: 0,
    completedMetrics: new Set(),
    stages: {
      shell: 0,
      header_seed: 0,
      message_seed: 0,
      message_viewport: 0,
      composer: 0,
    },
    stageLogEmitted: false,
    timingV2Emitted: false,
    explicitCloseAt: 0,
    mountGeneration: mountGen,
  };
  activeRoomSessions.set(roomId, session);
  setActiveSessionPointer(session);
  explicitClosedRoomIds.delete(roomId);
  cancelScheduledSessionClear(roomId);
  logTimingSession(session);
  logSessionReuse({
    roomId,
    existingSessionId: session.sessionId,
    requestedReason: reason,
    reused: false,
    sessionAgeMs: 0,
  });
  return session;
}

function reactivateSession(
  session: CmRoomEntryTimingSession,
  reason: CmRoomEntryTimingAcquireReason
): CmRoomEntryTimingSession {
  cancelScheduledSessionClear(session.roomId);
  if (session.status === "cleared" || session.status === "expired" || isSessionReuseExpired(session)) {
    return createSession(session.roomId, "ttl_expire");
  }
  setActiveSessionPointer(session);
  logSessionReuse({
    roomId: session.roomId,
    existingSessionId: session.sessionId,
    requestedReason: reason,
    reused: true,
    sessionAgeMs: sessionAgeMs(session),
  });
  return session;
}

function isStrictModeDoubleAcquire(roomId: string): boolean {
  const last = recentAcquireAtByRoom.get(roomId) ?? 0;
  const now = perfNow();
  if (now - last < CM_ROOM_STRICT_MODE_BEGIN_GUARD_MS) return true;
  recentAcquireAtByRoom.set(roomId, now);
  return false;
}

export function acquireCmRoomEntryTimingSession(
  roomId: string,
  reason: CmRoomEntryTimingAcquireReason = "nav_tap"
): { sessionId: string; created: boolean } {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return { sessionId: "", created: false };

  const existing = getSessionForRoom(id);
  const activeOther = activeSessionRoomId && activeSessionRoomId !== id ? activeSessionRoomId : null;

  if (activeOther && activeOther !== id) {
    scheduleCmRoomEntryTimingSessionCleanup(activeOther, "room_id_change");
    logCmRoomRemountDetect({
      roomId: id,
      previousSessionId: getSessionForRoom(activeOther)?.sessionId ?? null,
      newSessionId: existing?.sessionId ?? "",
      reason: "room_id_change",
      routeKeyChanged: true,
    });
    const session = createSession(id, "room_id_change");
    return { sessionId: session.sessionId, created: true };
  }

  if (explicitClosedRoomIds.has(id)) {
    explicitClosedRoomIds.delete(id);
    const session = createSession(id, "explicit_reopen");
    return { sessionId: session.sessionId, created: true };
  }

  if (existing && !isSessionReuseExpired(existing)) {
    if (isStrictModeDoubleAcquire(id) && (reason === "subtree_mount" || reason === "route_t0_fallback")) {
      reactivateSession(existing, "strict_mode_reuse");
      return { sessionId: existing.sessionId, created: false };
    }
    if (
      reason === "nav_tap" ||
      reason === "subtree_mount" ||
      reason === "route_t0_fallback" ||
      reason === "session_reuse" ||
      reason === "strict_mode_reuse"
    ) {
      reactivateSession(existing, reason === "nav_tap" ? "session_reuse" : reason);
      return { sessionId: existing.sessionId, created: false };
    }
    if (existing.status === "completed" || existing.frozen) {
      reactivateSession(existing, "session_reuse");
      return { sessionId: existing.sessionId, created: false };
    }
    reactivateSession(existing, "session_reuse");
    return { sessionId: existing.sessionId, created: false };
  }

  if (existing && isSessionReuseExpired(existing)) {
    const session = createSession(id, "ttl_expire");
    return { sessionId: session.sessionId, created: true };
  }

  const session = createSession(id, reason);
  return { sessionId: session.sessionId, created: true };
}

/** @deprecated use acquireCmRoomEntryTimingSession */
export function beginCmRoomEntryTimingSession(roomId: string): string {
  return acquireCmRoomEntryTimingSession(roomId, "nav_tap").sessionId;
}

export function markCmRoomEntryTimingExplicitClose(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  explicitClosedRoomIds.add(id);
  scheduleCmRoomEntryTimingSessionCleanup(id, "explicit_close", CM_ROOM_SESSION_POST_FREEZE_HOLD_MS);
}

export function noteCmRoomTimingSubtreeMount(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  cancelScheduledSessionClear(id);
  const prev = getSessionForRoom(id);
  const prevSessionId = prev?.sessionId ?? null;
  const { sessionId, created } = acquireCmRoomEntryTimingSession(id, "subtree_mount");
  if (!created && prevSessionId && prevSessionId === sessionId) {
    const { reused, remounted } = noteCmRoomSubtreeAttach(id, "shell", sessionId);
    if (remounted && !reused) {
      logCmRoomRemountDetect({
        roomId: id,
        previousSessionId: prevSessionId,
        newSessionId: sessionId,
        reason: "subtree_remount",
        effectReset: true,
        strictModeDoubleRun: false,
      });
    }
    return;
  }
  if (created && prevSessionId && prevSessionId !== sessionId) {
    logCmRoomRemountDetect({
      roomId: id,
      previousSessionId: prevSessionId,
      newSessionId: sessionId,
      reason: "subtree_mount_new_session",
      componentKeyChanged: true,
      effectReset: true,
    });
  }
}

export function scheduleCmRoomEntryTimingSessionCleanup(
  roomId: string,
  reason: string,
  delayMs = CM_ROOM_SESSION_POST_FREEZE_HOLD_MS
): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  if (isCmRoomRouteTransitionActive(id)) return;
  cancelScheduledSessionClear(id);
  const timer = window.setTimeout(() => {
    scheduledSessionClears.delete(id);
    if (isCmRoomRouteTransitionActive(id)) return;
    const session = getSessionForRoom(id);
    if (!session) return;
    if (session.frozen && perfNow() - session.completedAt < CM_ROOM_SESSION_POST_FREEZE_HOLD_MS) {
      scheduleCmRoomEntryTimingSessionCleanup(id, reason, CM_ROOM_SESSION_POST_FREEZE_HOLD_MS);
      return;
    }
    clearCmRoomEntryTimingSessionNow(id, reason);
  }, Math.max(0, delayMs));
  scheduledSessionClears.set(id, timer);
}

function clearCmRoomEntryTimingSessionNow(roomId: string, reason: string): void {
  const id = String(roomId ?? "").trim();
  const session = getSessionForRoom(id);
  if (!session) return;
  clearCmRoomTimingPendingWork();
  session.status = "cleared";
  session.completedAt = perfNow();
  logTimingSession(session);
  activeRoomSessions.delete(id);
  if (activeSessionRoomId === id) activeSessionRoomId = null;
}

export function clearCmRoomEntryTimingSession(reason: string, roomId?: string): void {
  const id = String(roomId ?? "").trim() || activeSessionRoomId || "";
  if (!id) return;

  if (reason === "room_client_unmount") {
    scheduleCmRoomEntryTimingSessionCleanup(id, reason, CM_ROOM_SESSION_POST_FREEZE_HOLD_MS);
    return;
  }
  if (isCmRoomRouteTransitionActive(id)) return;
  cancelScheduledSessionClear(id);
  clearCmRoomEntryTimingSessionNow(id, reason);
}

export function registerCmRoomTimingPendingCleanup(cleanup: () => void): () => void {
  pendingCleanups.add(cleanup);
  return () => {
    pendingCleanups.delete(cleanup);
  };
}

export function clearCmRoomTimingPendingWork(): void {
  for (const cleanup of pendingCleanups) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
  }
  pendingCleanups.clear();
}

export function freezeCmRoomEntryTimingSession(reason: string): void {
  const session = getActiveSession();
  if (!session || session.frozen) return;
  session.frozen = true;
  session.status = "completed";
  session.completedAt = perfNow();
  logTimingSession(session);
  scheduleCmRoomEntryTimingSessionCleanup(
    session.roomId,
    `post_freeze_hold:${reason}`,
    CM_ROOM_SESSION_POST_FREEZE_HOLD_MS
  );
}

export function getActiveCmRoomEntrySessionId(): string {
  return getActiveSession()?.sessionId ?? "";
}

export function getActiveCmRoomEntrySessionRoomId(): string {
  return activeSessionRoomId ?? "";
}

export function hasCmRoomEntryTimingSession(roomId?: string): boolean {
  const session = resolveSession(roomId);
  if (!session) return false;
  if (session.status === "cleared" || session.status === "expired") return false;
  if (isSessionReuseExpired(session)) return false;
  return true;
}

export function isCmRoomEntryTimingSessionActive(roomId?: string): boolean {
  const session = resolveSession(roomId);
  if (!session) return false;
  if (session.status === "cleared" || session.status === "expired") return false;
  if (isSessionReuseExpired(session)) return false;
  if (isSessionTapEmitExpired(session) && !session.frozen) return false;
  return true;
}

export function msSinceSessionTap(sessionId?: string, roomId?: string): number | null {
  const session = resolveSession(roomId);
  if (!session) return null;
  if (sessionId && sessionId !== session.sessionId) return null;
  if (isSessionReuseExpired(session)) return null;
  return Math.round(perfNow() - session.tapT0);
}

export function getCmRoomEntrySessionTapT0(sessionId?: string): number {
  const session = sessionId
    ? Array.from(activeRoomSessions.values()).find((s) => s.sessionId === sessionId)
    : getActiveSession();
  if (!session) return 0;
  if (sessionId && session.sessionId !== sessionId) return 0;
  return session.tapT0;
}

function isInPostFreezeHold(session: CmRoomEntryTimingSession): boolean {
  return (
    session.frozen &&
    session.completedAt > 0 &&
    perfNow() - session.completedAt < CM_ROOM_SESSION_POST_FREEZE_HOLD_MS
  );
}

export function assertCmRoomTimingEmit(params: {
  roomId: string;
  metric: CmRoomTimingMetric;
  sessionId?: string;
}): CmRoomEntryTimingSession | null {
  const roomId = String(params.roomId ?? "").trim();
  if (!roomId) {
    dropEmit(params.metric, "missing_room_id", roomId, params.sessionId);
    return null;
  }
  const session = getSessionForRoom(roomId);
  if (!session) {
    dropEmit(params.metric, "no_active_session", roomId, params.sessionId);
    return null;
  }
  setActiveSessionPointer(session);
  if (params.sessionId && params.sessionId !== session.sessionId) {
    dropEmit(params.metric, "stale_session_id", roomId, params.sessionId);
    return null;
  }
  if (session.status === "cleared" || session.status === "expired") {
    dropEmit(params.metric, "session_cleared", roomId, params.sessionId);
    return null;
  }
  if (isSessionReuseExpired(session)) {
    dropEmit(params.metric, "session_reuse_ttl_expired", roomId, params.sessionId);
    return null;
  }
  const frozenBlocked =
    session.frozen && !isInPostFreezeHold(session) && session.completedMetrics.has(params.metric);
  if (frozenBlocked) {
    dropEmit(params.metric, "session_frozen_or_completed", roomId, params.sessionId);
    return null;
  }
  if (!session.frozen && isSessionTapEmitExpired(session)) {
    dropEmit(params.metric, "tap_ttl_expired", roomId, params.sessionId);
    return null;
  }
  if (session.completedMetrics.has(params.metric)) {
    dropEmit(params.metric, "metric_deduped", roomId, params.sessionId);
    return null;
  }
  return session;
}

export function markCmRoomTimingMetricRecorded(metric: CmRoomTimingMetric, roomId?: string): void {
  const session = resolveSession(roomId);
  session?.completedMetrics.add(metric);
}

export function mutateCmRoomEntryTimingSession(
  mutator: (session: CmRoomEntryTimingSession) => void,
  roomId?: string
): CmRoomEntryTimingSession | null {
  const session = resolveSession(roomId);
  if (!session) return null;
  setActiveSessionPointer(session);
  mutator(session);
  return session;
}

export function resetCmRoomEntryTimingSessionForTests(): void {
  clearCmRoomTimingPendingWork();
  for (const timer of scheduledSessionClears.values()) clearTimeout(timer);
  scheduledSessionClears.clear();
  activeRoomSessions.clear();
  activeSessionRoomId = null;
  sessionSeq = 0;
  roomMountGenerations.clear();
  recentAcquireAtByRoom.clear();
  explicitClosedRoomIds.clear();
}
