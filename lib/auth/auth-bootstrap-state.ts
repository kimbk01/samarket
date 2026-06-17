"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";

type BootstrapPhase = "unknown" | "initial_session_pending" | "initial_session_done";

let bootstrapPhase: BootstrapPhase = "unknown";
let initialSessionHasSession = false;
let initialSessionDoneAt = 0;

function logAuthBoot(event: string, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(`[auth-boot] ${event}`, JSON.stringify({ at: Date.now(), ...payload }));
}

export function markAuthBootstrapInitialSessionStart(): void {
  if (bootstrapPhase !== "unknown") return;
  bootstrapPhase = "initial_session_pending";
  logAuthBoot("initial_session_start", {});
}

export function markAuthBootstrapInitialSessionDone(hasSession: boolean): void {
  if (bootstrapPhase === "initial_session_done") return;
  bootstrapPhase = "initial_session_done";
  initialSessionHasSession = hasSession;
  initialSessionDoneAt = Date.now();
  logAuthBoot("initial_session_done", { hasSession });
}

export function isAuthBootstrapInitialSessionDone(): boolean {
  return bootstrapPhase === "initial_session_done";
}

export function peekAuthBootstrapInitialSessionHasSession(): boolean {
  return initialSessionHasSession;
}

/** guest 확정은 INITIAL_SESSION 완료 후에만 허용 */
export function canEstablishGuestAuthState(): boolean {
  return isAuthBootstrapInitialSessionDone();
}

const MEMBERSHIP_BOOTSTRAP_WAIT_MS = 1_200;

/**
 * membership 전용 — `ensureSessionHealthy` single-flight 를 점유하지 않고
 * Supabase INITIAL_SESSION 완료만 대기한다.
 */
export async function awaitAuthBootstrapInitialSession(
  options: { timeoutMs?: number } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  if (isAuthBootstrapInitialSessionDone()) return;

  markAuthBootstrapInitialSessionStart();
  const timeoutMs = options.timeoutMs ?? MEMBERSHIP_BOOTSTRAP_WAIT_MS;
  await awaitClientSupabaseSessionReady(timeoutMs);

  if (isAuthBootstrapInitialSessionDone()) return;

  const sb = getSupabaseClient();
  let hasSession = false;
  if (sb) {
    const { data } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
    hasSession = Boolean(data.session?.user?.id);
  }
  markAuthBootstrapInitialSessionDone(hasSession);
}

export function resetAuthBootstrapStateForTests(): void {
  bootstrapPhase = "unknown";
  initialSessionHasSession = false;
  initialSessionDoneAt = 0;
}
