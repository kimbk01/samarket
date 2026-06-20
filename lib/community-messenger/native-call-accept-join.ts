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

export function isWithinAcceptRaceWindow(sessionId: string, now = Date.now()): boolean {
  const at = acceptCompletedEnteredAt.get(sessionId.trim());
  if (at == null) return false;
  return now - at <= ACCEPT_RACE_WINDOW_MS;
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

/** 네이티브 accept PATCH 후 WebView 진입 — active 세션까지 짧게 폴링 */
export async function waitForActiveCallSessionAfterNativeAccept(input: {
  refreshSession: (silent?: boolean) => Promise<CommunityMessengerCallSession | null>;
  readSession: () => CommunityMessengerCallSession | null;
  maxAttempts?: number;
  delayMs?: number;
  onRefreshStart?: (attempt: number) => void;
  onRefreshResult?: (attempt: number, status: CommunityMessengerCallSession["status"] | null) => void;
}): Promise<CommunityMessengerCallSession | null> {
  const maxAttempts = input.maxAttempts ?? 10;
  const delayMs = input.delayMs ?? 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    input.onRefreshStart?.(attempt);
    const refreshed = await input.refreshSession(true);
    const session = refreshed ?? input.readSession();
    input.onRefreshResult?.(attempt, session?.status ?? null);
    if (session?.status === "active") {
      markServerActiveConfirmed(session.id);
      return session;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
  const finalSession = input.readSession();
  if (finalSession?.status === "active") {
    markServerActiveConfirmed(finalSession.id);
    return finalSession;
  }
  return null;
}
