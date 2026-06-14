"use client";

/**
 * DIBAY 클라이언트 세션 단일 진입점.
 * @see docs/dibay-session-policy.md
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { wipeClientSessionState } from "@/lib/auth/client-session-wipe";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";
import { isTerminalAuthCode, type DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { clearAuthSessionClientCache, fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import {
  clearGuestAuthState,
  establishGuestAuthState,
  exposeGuestAuthStateProbeForDev,
  isGuestAuthEstablished,
  logGuestFetchSkipped,
  noteGuest401,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import { exposeResetAuthStateForDev } from "@/lib/auth/reset-auth-state";

const AUTH_BC_NAME = "dibay:auth";
const ENSURE_HEALTH_FLIGHT = "dibay:ensure-session-healthy";

type AuthBcMessage =
  | { type: "refresh_lock" }
  | { type: "refresh_done" }
  | { type: "signed_out" };

type AuthEventHandler = (event: AuthChangeEvent, session: Session | null) => void;

let sessionPhase: DibaySessionPhase = "loading";
const phaseListeners = new Set<(phase: DibaySessionPhase) => void>();
const authEventHandlers = new Set<AuthEventHandler>();

let authListenerBound = false;
let authSubscription: { unsubscribe: () => void } | null = null;
let authBc: BroadcastChannel | null = null;
let remoteRefreshLock = false;

function setSessionPhase(next: DibaySessionPhase): void {
  if (sessionPhase === next) return;
  sessionPhase = next;
  phaseListeners.forEach((l) => l(next));
}

export function getSessionPhase(): DibaySessionPhase {
  return sessionPhase;
}

export function subscribeSessionPhase(listener: (phase: DibaySessionPhase) => void): () => void {
  phaseListeners.add(listener);
  return () => phaseListeners.delete(listener);
}

/** dibay-session-manager canonical listener 이후 UI·캐시 동기화용 — onAuthStateChange 중복 구독 금지 */
export function subscribeDibayAuthStateChange(handler: AuthEventHandler): () => void {
  authEventHandlers.add(handler);
  return () => authEventHandlers.delete(handler);
}

function dispatchAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
  handleAuthStateChange(event, session);
  authEventHandlers.forEach((handler) => {
    try {
      handler(event, session);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/** vitest — Supabase SDK 없이 fan-out·phase 전파 검증 */
export function dispatchDibayAuthStateChangeForTests(event: AuthChangeEvent, session: Session | null): void {
  dispatchAuthStateChange(event, session);
}

function getAuthBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (authBc) return authBc;
  try {
    authBc = new BroadcastChannel(AUTH_BC_NAME);
    authBc.onmessage = (ev: MessageEvent<AuthBcMessage>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "refresh_lock") remoteRefreshLock = true;
      if (msg.type === "refresh_done") remoteRefreshLock = false;
      if (msg.type === "signed_out") {
        setSessionPhase("guest");
        establishGuestAuthState("auth_bc:signed_out");
      }
    };
    return authBc;
  } catch {
    return null;
  }
}

function postAuthBc(message: AuthBcMessage): void {
  try {
    getAuthBroadcastChannel()?.postMessage(message);
  } catch {
    /* ignore */
  }
}

function terminalFromAuthError(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").trim();
  if (isTerminalAuthCode(code)) return true;
  return shouldClearProfileCacheOnGetUserFailure(null, error);
}

type RegistryValidationResult =
  | { ok: true }
  | { ok: false; ghost: true }
  | { ok: false; ghost: false; phase: "loading" };

async function validateRegistryMatchesSupabaseSession(source: string): Promise<RegistryValidationResult> {
  try {
    const res = await fetchAuthSessionNoStore(`ensureHealthy:${source}`);
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, ghost: true };
    if (res.status >= 500 || res.status === 429) {
      return { ok: false, ghost: false, phase: "loading" };
    }
    return { ok: false, ghost: true };
  } catch {
    return { ok: false, ghost: false, phase: "loading" };
  }
}

async function reconcileGhostSupabaseSession(source: string): Promise<void> {
  clearAuthSessionClientCache();
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  await wipeClientSessionState("user_logout", { setPostLogoutGuard: false });
  postAuthBc({ type: "signed_out" });
  void source;
}

async function confirmAuthenticatedWithRegistry(
  source: string
): Promise<
  | { ok: true; phase: "authenticated" }
  | { ok: false; phase: DibaySessionPhase; terminal: boolean }
> {
  const registry = await validateRegistryMatchesSupabaseSession(source);
  if (registry.ok) {
    clearGuestAuthState();
    setSessionPhase("authenticated");
    return { ok: true, phase: "authenticated" };
  }
  if (registry.ghost) {
    await reconcileGhostSupabaseSession(source);
    noteGuest401(`ensureHealthy:ghost:${source}`);
    setSessionPhase("guest");
    return { ok: false, phase: "guest", terminal: false };
  }
  setSessionPhase("loading");
  return { ok: false, phase: "loading", terminal: false };
}

export type EnsureSessionHealthyResult =
  | { ok: true; phase: "authenticated" }
  | { ok: false; phase: DibaySessionPhase; terminal: boolean };

/**
 * refreshSession 1회 → getUser 1회 → /api/auth/session 확인.
 * terminal 확인 전 hard logout 금지.
 */
function markGuestFromSessionCheck(source: string, from401: boolean): EnsureSessionHealthyResult {
  if (from401) {
    noteGuest401(`ensureHealthy:${source}`);
  } else {
    establishGuestAuthState(`ensureHealthy:${source}`);
  }
  setSessionPhase("guest");
  return { ok: false, phase: "guest", terminal: false };
}

export async function ensureSessionHealthy(source: string): Promise<EnsureSessionHealthyResult> {
  if (typeof window === "undefined") {
    establishGuestAuthState("ensureHealthy:ssr");
    setSessionPhase("guest");
    return { ok: false, phase: "guest", terminal: false };
  }

  if (isGuestAuthEstablished() && sessionPhase === "guest") {
    logGuestFetchSkipped("ensureSessionHealthy", source);
    return { ok: false, phase: "guest", terminal: false };
  }

  return runSingleFlight(ENSURE_HEALTH_FLIGHT, async () => {
    if (isGuestAuthEstablished() && sessionPhase === "guest") {
      logGuestFetchSkipped("ensureSessionHealthy", source);
      return { ok: false, phase: "guest", terminal: false };
    }

    const sb = getSupabaseClient();
    if (!sb) {
      return markGuestFromSessionCheck(source, false);
    }

    setSessionPhase("loading");

    const { data: sessionData } = await sb.auth.getSession();
    if (sessionData.session?.user?.id) {
      return confirmAuthenticatedWithRegistry(source);
    }

    if (!remoteRefreshLock) {
      postAuthBc({ type: "refresh_lock" });
      try {
        const refreshed = await runBrowserAuthRefreshDeduped(sb, source);
        const refreshErr = refreshed.error as { code?: string; message?: string } | null;
        if (refreshErr && terminalFromAuthError(refreshErr)) {
          setSessionPhase("corrupt");
          return { ok: false, phase: "corrupt", terminal: true };
        }
        if (refreshed.data.session?.user?.id) {
          return confirmAuthenticatedWithRegistry(source);
        }
      } finally {
        postAuthBc({ type: "refresh_done" });
      }
    }

    const { data: { user }, error: userErr } = await dedupeSupabaseAuthGetUser(sb);
    if (user?.id) {
      return confirmAuthenticatedWithRegistry(source);
    }
    if (terminalFromAuthError(userErr)) {
      setSessionPhase("corrupt");
      return { ok: false, phase: "corrupt", terminal: true };
    }

    try {
      const res = await fetchAuthSessionNoStore(source);
      if (res.ok) {
        clearGuestAuthState();
        setSessionPhase("authenticated");
        return { ok: true, phase: "authenticated" };
      }
      if (res.status >= 500 || res.status === 429) {
        setSessionPhase("loading");
        return { ok: false, phase: "loading", terminal: false };
      }
      if (res.status === 401) {
        let code = "";
        try {
          const body = (await res.clone().json()) as { code?: string };
          code = String(body?.code ?? "").trim();
        } catch {
          code = "";
        }
        if (isTerminalAuthCode(code) || terminalFromAuthError({ code, status: 401 })) {
          setSessionPhase("corrupt");
          return { ok: false, phase: "corrupt", terminal: true };
        }
        return markGuestFromSessionCheck(source, true);
      }
    } catch {
      setSessionPhase("loading");
      return { ok: false, phase: "loading", terminal: false };
    }

    return markGuestFromSessionCheck(source, false);
  });
}

export async function handleApi401(source: string): Promise<EnsureSessionHealthyResult> {
  return ensureSessionHealthy(`api401:${source}`);
}

function handleAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
  if (event === "SIGNED_OUT" || (!session?.user?.id && event === "INITIAL_SESSION")) {
    setSessionPhase("guest");
    establishGuestAuthState(`auth_event:${event}`);
    postAuthBc({ type: "signed_out" });
    return;
  }
  if (session?.user?.id) {
    clearGuestAuthState();
    setSessionPhase("authenticated");
  }
}

/**
 * 앱 셸에서 1회만 호출 — Supabase onAuthStateChange 단일 listener.
 */
export function bindDibaySessionManagerAuthListener(): () => void {
  if (typeof window === "undefined") return () => {};
  if (authListenerBound && authSubscription) {
    return () => authSubscription?.unsubscribe();
  }

  getAuthBroadcastChannel();
  exposeGuestAuthStateProbeForDev();
  exposeResetAuthStateForDev();
  const sb = getSupabaseClient();
  if (!sb) {
    establishGuestAuthState("bindAuthListener:no_client");
    setSessionPhase("guest");
    return () => {};
  }

  authListenerBound = true;
  const { data: { subscription } } = sb.auth.onAuthStateChange(dispatchAuthStateChange);
  authSubscription = subscription;

  void ensureSessionHealthy("bindAuthListener");

  return () => {
    subscription.unsubscribe();
    authListenerBound = false;
    authSubscription = null;
  };
}

/** 테스트·dev reset */
export function resetDibaySessionManagerForTests(): void {
  sessionPhase = "loading";
  resetGuestAuthStateForTests();
  authListenerBound = false;
  authSubscription = null;
  authEventHandlers.clear();
  remoteRefreshLock = false;
  try {
    authBc?.close();
  } catch {
    /* ignore */
  }
  authBc = null;
}
