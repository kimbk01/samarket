import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export const OPTIMISTIC_ACTIVE_CALL_SESSION_SEED_SOURCES = new Set([
  "native_accept_bootstrap",
  "native_accept_prep_bootstrap",
  "native_accept_hydrate_seed",
]);

const serverActiveConfirmedAt = new Map<string, number>();
const acceptCompletedEnteredAt = new Map<string, number>();

export const ACCEPT_RACE_JOIN_RETRY_MAX = 2;
export const ACCEPT_RACE_WINDOW_MS = 15_000;
export const ACCEPT_ACTIVE_POLL_MAX_ATTEMPTS = 6;
export const ACCEPT_ACTIVE_POLL_DELAY_MS = 120;

export function isOptimisticActiveCallSessionSeed(
  session: Pick<CommunityMessengerCallSession, "status" | "source"> | null | undefined
): boolean {
  if (!session || session.status !== "active") return false;
  const source = session.source?.trim();
  return Boolean(source && OPTIMISTIC_ACTIVE_CALL_SESSION_SEED_SOURCES.has(source));
}

export function markServerActiveConfirmed(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  serverActiveConfirmedAt.set(sid, Date.now());
}

export function clearServerActiveConfirmed(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  serverActiveConfirmedAt.delete(sid);
}

export function isServerActiveConfirmed(sessionId: string): boolean {
  return serverActiveConfirmedAt.has(sessionId.trim());
}

export function markNativeAcceptCompletedEntered(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  acceptCompletedEnteredAt.set(sid, Date.now());
}

/** Web/native accept 완료 직후 join race 보호 — markNativeAcceptCompletedEntered 와 동일 */
export function markAcceptJoinRaceWindow(sessionId: string): void {
  markNativeAcceptCompletedEntered(sessionId);
}

export function isWithinAcceptRaceWindow(sessionId: string, now = Date.now()): boolean {
  const at = acceptCompletedEnteredAt.get(sessionId.trim());
  if (at == null) return false;
  return now - at <= ACCEPT_RACE_WINDOW_MS;
}

/** GET 응답 — optimistic local seed 제외하고 server-confirmed */
export function confirmServerActiveFromFetchedSession(
  session: CommunityMessengerCallSession | null | undefined
): boolean {
  if (!session || session.status !== "active") return false;
  if (isOptimisticActiveCallSessionSeed(session)) return false;
  markServerActiveConfirmed(session.id);
  return true;
}

/** PATCH accept 응답 — 서버 authoritative, optimistic seed 무시 */
export function confirmServerActiveFromPatchAccept(
  session: CommunityMessengerCallSession | null | undefined
): boolean {
  if (!session || session.status !== "active") return false;
  markServerActiveConfirmed(session.id);
  return true;
}

/** Realtime ringing→active — DB row authoritative */
export function confirmServerActiveFromRealtimeActiveTransition(sessionId: string): void {
  markServerActiveConfirmed(sessionId);
}

/** Realtime active 전환 직후 optimistic seed 제거 — join defer 재발 방지 */
export function stripOptimisticActiveSeedFromSession(
  session: CommunityMessengerCallSession
): CommunityMessengerCallSession {
  if (!isOptimisticActiveCallSessionSeed(session)) return session;
  const { source: _ignored, ...rest } = session;
  return rest;
}

export function canStartCalleeJoin(input: {
  session: CommunityMessengerCallSession;
  isCallee: boolean;
  serverConfirmed?: boolean;
}): { ok: true } | { ok: false; reason: "deferred" | "not_callee" | "not_active" } {
  if (!input.isCallee) return { ok: false, reason: "not_callee" };
  if (input.session.status !== "active") return { ok: false, reason: "not_active" };
  if (input.serverConfirmed || isServerActiveConfirmed(input.session.id)) {
    return { ok: true };
  }
  if (isOptimisticActiveCallSessionSeed(input.session)) {
    return { ok: false, reason: "deferred" };
  }
  return { ok: true };
}

export type AcceptRaceJoinFailureContext = {
  sessionId: string;
  nativePrepRoute: boolean;
  nativeAcceptCompletedRoute: boolean;
  acceptPatchInFlight: boolean;
  busyAccept: boolean;
  joinRetryCount: number;
  serverStatusAfterRefresh: CommunityMessengerCallSession["status"] | null;
  joinRetryable: boolean;
};

export function shouldAutoEndAfterJoinFailure(ctx: AcceptRaceJoinFailureContext): boolean {
  if (ctx.nativePrepRoute || ctx.nativeAcceptCompletedRoute || isWithinAcceptRaceWindow(ctx.sessionId)) {
    return false;
  }
  if (ctx.acceptPatchInFlight || ctx.busyAccept) return false;
  if (
    ctx.serverStatusAfterRefresh === "ringing" ||
    (ctx.serverStatusAfterRefresh === "active" && isWithinAcceptRaceWindow(ctx.sessionId))
  ) {
    return false;
  }
  if (ctx.joinRetryable && ctx.joinRetryCount < ACCEPT_RACE_JOIN_RETRY_MAX) {
    return false;
  }
  return true;
}

/** native accept PATCH 후 — 서버 GET active 만 짧게 폴링 (로컬 seed fallback 금지) */
export async function waitForActiveCallSessionAfterNativeAccept(input: {
  refreshSession: (silent?: boolean) => Promise<CommunityMessengerCallSession | null>;
  maxAttempts?: number;
  delayMs?: number;
  onRefreshStart?: (attempt: number) => void;
  onRefreshResult?: (attempt: number, status: CommunityMessengerCallSession["status"] | null) => void;
}): Promise<CommunityMessengerCallSession | null> {
  const maxAttempts = input.maxAttempts ?? ACCEPT_ACTIVE_POLL_MAX_ATTEMPTS;
  const delayMs = input.delayMs ?? ACCEPT_ACTIVE_POLL_DELAY_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    input.onRefreshStart?.(attempt);
    const refreshed = await input.refreshSession(true);
    input.onRefreshResult?.(attempt, refreshed?.status ?? null);
    if (refreshed && confirmServerActiveFromFetchedSession(refreshed)) {
      return refreshed;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
  return null;
}
