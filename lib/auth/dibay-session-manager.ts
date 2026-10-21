"use client";

/**
 * DIBAY 클라이언트 세션 단일 진입점.
 * @see docs/dibay-session-policy.md
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";
import { isTerminalAuthCode, type DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import {
  clearGuestAuthState,
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  exposeGuestAuthStateProbeForDev,
  isGuestAuthEstablished,
  isRecoverableGuestAuthEstablished,
  logGuestFetchSkipped,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import { registerRecoverableGuestRecoveryBootstrap } from "@/lib/auth/guest-auth-recovery";
import { exposeResetAuthStateForDev } from "@/lib/auth/reset-auth-state";
import { isExplicitLogoutIntentActive } from "@/lib/auth/explicit-logout-intent";
import { shouldSkipSignedOutEventWipe } from "@/lib/auth/client-session-wipe";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  beginUnexpectedSignedOutRecovery,
  convergeUnexpectedSignedOutHealth,
  settleUnexpectedSignedOutRecovery,
  resetUnexpectedSignedOutRecoveryForTests,
} from "@/lib/auth/unexpected-signed-out-recovery";

const AUTH_BC_NAME = "dibay:auth";
const ENSURE_HEALTH_FLIGHT = "dibay:ensure-session-healthy";
const GUEST_RECOVERY_FLIGHT = "dibay:recoverable-guest-session";

type AuthBcMessage =
  | { type: "refresh_lock" }
  | { type: "refresh_done" }
  | { type: "signed_out" }
  /** P0-2 — 명시 로그아웃 탭이 wipe 완료 후 1회 발행. 수신 탭은 같은 wipe + 하드 이동. */
  | { type: "explicit_logout"; previousUserId: string | null };

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

function projectMemberEventEligibility(
  eligible: boolean,
  reason: string,
  boundUserId?: string | null,
): void {
  void import("@/lib/push/native/member-call-eligibility-bridge").then(
    ({ projectNativeMemberEventEligibility }) =>
      projectNativeMemberEventEligibility({
        eligible,
        boundUserId: eligible ? boundUserId : null,
        reason,
      }),
  );
}

function applyAuthenticatedPhase(source: string, boundUserId?: string | null): void {
  clearGuestAuthState();
  setSessionPhase("authenticated");
  logGuestAuthBootMarker("session_authenticated", { source });
  const uid =
    (typeof boundUserId === "string" && boundUserId.trim()) || getBoundAuthUserId() || null;
  projectMemberEventEligibility(true, `session_authenticated:${source}`, uid);
}

function applyTerminalGuestPhase(source: string): void {
  establishGuestAuthState(source);
  setSessionPhase("terminal_guest");
  projectMemberEventEligibility(false, `terminal_guest:${source}`, null);
}

function shouldSkipEnsureHealthyForTerminalGuestGate(): boolean {
  return isGuestAuthEstablished() && !isRecoverableGuestAuthEstablished();
}

export function getSessionPhase(): DibaySessionPhase {
  return sessionPhase;
}

/** Explicit logout / confirmed terminal guest — never auto-called from boot races. */
export function markSessionTerminalGuestFromClient(source: string): void {
  applyTerminalGuestPhase(source);
}

/** Supabase session prime / recovery success — SSOT for authenticated phase + guest clear. */
export function markSessionAuthenticatedFromClient(source: string): void {
  applyAuthenticatedPhase(source);
}

/** Boot/cookie race — recovering without wipe/deactivate. */
export function markSessionRecoveringFromClient(source: string): void {
  setSessionPhase("recovering");
  logGuestAuthBootMarker("session_recovering", { source });
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
        // Only explicit tabs broadcast signed_out — treat as terminal.
        applyTerminalGuestPhase("auth_bc:signed_out");
      }
      if (msg.type === "explicit_logout") {
        void handleExplicitLogoutBroadcast(msg.previousUserId ?? null);
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

let explicitLogoutBroadcastHandled = false;

/**
 * P0-2 — 다른 탭의 **명시 로그아웃** broadcast 수신.
 * 로그아웃 탭과 같은 `wipeClientSessionState("user_logout")` 후 같은 post-logout 경로로 hard replace.
 * 예상치 못한 SIGNED_OUT 복구 경로(CUT-A)는 건드리지 않는다 — 이 경로는 explicit 메시지 출처로만 진입.
 */
async function handleExplicitLogoutBroadcast(previousUserId: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  if (explicitLogoutBroadcastHandled) return;
  const { getTabAuthenticatedUserId } = await import("@/lib/auth/client-instance-id");
  const tabUserId = getTabAuthenticatedUserId();
  // 이 탭이 이미 다른 계정으로 인증돼 있으면(로그아웃 대상 아님) 무시.
  if (previousUserId && tabUserId && tabUserId !== previousUserId) return;
  explicitLogoutBroadcastHandled = true;
  logGuestAuthBootMarker("signed_out_terminal_guest", {
    source: "auth_bc:explicit_logout",
    hadTabUserId: !!tabUserId,
  });
  const { markExplicitLogoutWipeDone, wipeClientSessionState } = await import(
    "@/lib/auth/client-session-wipe"
  );
  // 이 탭의 cross-tab SIGNED_OUT 은 명시 로그아웃 결과 — unexpected 복구 경로로 보내지 않는다.
  markExplicitLogoutWipeDone();
  applyTerminalGuestPhase("auth_bc:explicit_logout");
  try {
    await wipeClientSessionState("user_logout");
  } finally {
    establishGuestAuthState("auth_bc:explicit_logout");
    const { navigateAfterAuthExitOnce } = await import("@/lib/auth/auth-exit-coordinator");
    navigateAfterAuthExitOnce("logout");
  }
}

/** 명시 로그아웃 플로우(wipe 완료 후)에서만 호출 — 다른 탭에 같은 wipe + 이동을 요청 */
export function broadcastExplicitLogoutToOtherTabs(previousUserId: string | null): void {
  postAuthBc({ type: "explicit_logout", previousUserId: previousUserId ?? null });
}

/** vitest — BroadcastChannel 없이 수신 처리 검증 */
export function handleExplicitLogoutBroadcastForTests(previousUserId: string | null): Promise<void> {
  return handleExplicitLogoutBroadcast(previousUserId);
}

/**
 * P2-10 — 비명시 SIGNED_OUT 이 **확정** terminal(guest/corrupt)로 수렴했고 이 기기에 bound user 가 남아 있으면
 * 로컬 wipe 1회 (single-flight). recovering/loading 은 guest 로 보지 않는다 (HARD LOCK contract A).
 */
function wipeAfterConfirmedTerminalSignedOut(result: EnsureSessionHealthyResult): void {
  if (result.ok) return;
  const confirmedTerminal =
    result.terminal === true || result.phase === "corrupt" || result.phase === "terminal_guest";
  if (!confirmedTerminal) return;
  if (!getBoundAuthUserId()) return;
  logGuestAuthBootMarker("signed_out_terminal_guest", {
    source: "unexpected_converged_local_wipe",
    phase: result.phase,
  });
  void import("@/lib/auth/client-session-wipe")
    .then(({ wipeClientSessionState }) => wipeClientSessionState("user_logout"))
    .then(() => import("@/lib/app-boot/run-app-boot"))
    .then(({ ensureAppBoot }) => {
      // CUT-A — wipe 의 invalidateAppBootAll 이후 boot 재무장 (bound id 는 비워져 재진입 없음).
      void ensureAppBoot();
    })
    .catch(() => undefined);
}

function terminalFromAuthError(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").trim();
  if (isTerminalAuthCode(code)) return true;
  return shouldClearProfileCacheOnGetUserFailure(null, error);
}

type RegistryValidationResult =
  | { ok: true }
  | { ok: false; ghost: false; phase: "recovering" | "loading" };

async function validateRegistryMatchesSupabaseSession(source: string): Promise<RegistryValidationResult> {
  try {
    const res = await fetchAuthSessionNoStore(`ensureHealthy:${source}`);
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, ghost: false, phase: "recovering" };
    if (res.status >= 500 || res.status === 429) {
      return { ok: false, ghost: false, phase: "loading" };
    }
    return { ok: false, ghost: false, phase: "recovering" };
  } catch {
    return { ok: false, ghost: false, phase: "loading" };
  }
}

async function confirmAuthenticatedWithRegistry(
  source: string,
  boundUserId?: string | null,
): Promise<
  | { ok: true; phase: "authenticated" }
  | { ok: false; phase: DibaySessionPhase; terminal: boolean }
> {
  const registry = await validateRegistryMatchesSupabaseSession(source);
  if (registry.ok) {
    applyAuthenticatedPhase(source, boundUserId);
    return { ok: true, phase: "authenticated" };
  }
  if (registry.phase === "recovering") {
    return markRecoveringFromSessionCheck(source, "registry_mismatch");
  }
  setSessionPhase("loading");
  return { ok: false, phase: "loading", terminal: false };
}

export type EnsureSessionHealthyResult =
  | { ok: true; phase: "authenticated" }
  | { ok: false; phase: DibaySessionPhase; terminal: boolean };

/**
 * refreshSession 1회 → getUser 1회 → /api/auth/session 확인.
 * terminal auth code 확인 전 hard logout/wipe/deactivate 금지.
 */
function markRecoveringFromSessionCheck(source: string, reason: string): EnsureSessionHealthyResult {
  establishRecoverableGuestAuthState(`recovering:${source}:${reason}`);
  setSessionPhase("recovering");
  logGuestAuthBootMarker("session_recovering", { source, reason });
  return { ok: false, phase: "recovering", terminal: false };
}

export async function ensureSessionHealthy(source: string): Promise<EnsureSessionHealthyResult> {
  if (typeof window === "undefined") {
    return markRecoveringFromSessionCheck("ensureHealthy:ssr", "ssr");
  }

  if (shouldSkipEnsureHealthyForTerminalGuestGate()) {
    logGuestFetchSkipped("ensureSessionHealthy", source);
    return { ok: false, phase: "terminal_guest", terminal: false };
  }

  return runEnsureSessionHealthyInternal(source);
}

async function runEnsureSessionHealthyInternal(source: string): Promise<EnsureSessionHealthyResult> {
  return runSingleFlight(ENSURE_HEALTH_FLIGHT, async () => {
    logGuestAuthBootMarker("recovery_session_check_start", { source });
    if (shouldSkipEnsureHealthyForTerminalGuestGate()) {
      logGuestFetchSkipped("ensureSessionHealthy", source);
      const result = { ok: false as const, phase: "terminal_guest" as const, terminal: false };
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      const result = markRecoveringFromSessionCheck(source, "no_supabase_client");
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }

    setSessionPhase("loading");

    const { data: sessionData } = await sb.auth.getSession();
    if (sessionData.session?.user?.id) {
      const result = await confirmAuthenticatedWithRegistry(source, sessionData.session.user.id);
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }

    if (!remoteRefreshLock) {
      postAuthBc({ type: "refresh_lock" });
      try {
        const refreshed = await runBrowserAuthRefreshDeduped(sb, source);
        const refreshErr = refreshed.error as { code?: string; message?: string } | null;
        if (refreshErr && terminalFromAuthError(refreshErr)) {
          setSessionPhase("corrupt");
          const result = { ok: false as const, phase: "corrupt" as const, terminal: true };
          logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
          return result;
        }
        if (refreshed.data.session?.user?.id) {
          const result = await confirmAuthenticatedWithRegistry(
            source,
            refreshed.data.session.user.id,
          );
          logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
          return result;
        }
      } finally {
        postAuthBc({ type: "refresh_done" });
      }
    }

    const { data: { user }, error: userErr } = await dedupeSupabaseAuthGetUser(sb);
    if (user?.id) {
      const result = await confirmAuthenticatedWithRegistry(source, user.id);
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }
    if (terminalFromAuthError(userErr)) {
      setSessionPhase("corrupt");
      const result = { ok: false as const, phase: "corrupt" as const, terminal: true };
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }

    try {
      const res = await fetchAuthSessionNoStore(source);
      if (res.ok) {
        applyAuthenticatedPhase(source);
        const result = { ok: true as const, phase: "authenticated" as const };
        logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
        return result;
      }
      if (res.status >= 500 || res.status === 429) {
        setSessionPhase("loading");
        const result = { ok: false as const, phase: "loading" as const, terminal: false };
        logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
        return result;
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
          const result = { ok: false as const, phase: "corrupt" as const, terminal: true };
          logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
          return result;
        }
        const result = markRecoveringFromSessionCheck(source, "session_registry_401");
        logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
        return result;
      }
    } catch {
      setSessionPhase("loading");
      const result = { ok: false as const, phase: "loading" as const, terminal: false };
      logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
      return result;
    }

    const result = markRecoveringFromSessionCheck(source, "session_unresolved");
    logGuestAuthBootMarker("recovery_session_check_done", { source, ...result });
    return result;
  });
}

/** Recoverable boot guest — bypass terminal guest fetch gate until recovery succeeds or terminal auth. */
export async function attemptRecoverableGuestSession(
  source: string,
): Promise<EnsureSessionHealthyResult> {
  if (!isRecoverableGuestAuthEstablished()) {
    return { ok: false, phase: sessionPhase, terminal: false };
  }
  return runSingleFlight(GUEST_RECOVERY_FLIGHT, () => runEnsureSessionHealthyInternal(`guest_recovery:${source}`));
}

export async function handleApi401(source: string): Promise<EnsureSessionHealthyResult> {
  return ensureSessionHealthy(`api401:${source}`);
}

function handleAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
  if (event === "SIGNED_OUT") {
    const explicit =
      isExplicitLogoutIntentActive() || shouldSkipSignedOutEventWipe();
    if (explicit) {
      applyTerminalGuestPhase("auth_event:SIGNED_OUT:explicit");
      postAuthBc({ type: "signed_out" });
      logGuestAuthBootMarker("signed_out_terminal_guest", { source: "explicit" });
      return;
    }

    const { generation, skipped } = beginUnexpectedSignedOutRecovery();
    if (skipped) {
      logGuestAuthBootMarker("signed_out_unexpected_deduped", {
        source: "auth_event:SIGNED_OUT",
        generation,
      });
      return;
    }

    // Unexpected SIGNED_OUT (tab race / transient clear) ≠ product logout.
    establishRecoverableGuestAuthState("auth_event:SIGNED_OUT:unexpected");
    setSessionPhase("recovering");
    logGuestAuthBootMarker("signed_out_unexpected_recovering", {
      source: "auth_event:SIGNED_OUT",
      generation,
    });
    void ensureSessionHealthy("auth_event:SIGNED_OUT:unexpected")
      .then((result) => {
        const outcome = convergeUnexpectedSignedOutHealth(result);
        logGuestAuthBootMarker("signed_out_unexpected_converged", {
          generation,
          outcome,
          phase: result.phase,
          ok: result.ok,
          terminal: "terminal" in result ? result.terminal : false,
        });
        if (outcome === "authenticated") {
          return;
        }
        if (outcome === "transient_recovering") {
          setSessionPhase("recovering");
          return;
        }
        if (outcome === "corrupt") {
          setSessionPhase("corrupt");
          projectMemberEventEligibility(false, "signed_out_converged:corrupt");
          wipeAfterConfirmedTerminalSignedOut(result);
          return;
        }
        // terminal_guest — server/local session confirmed absent after health check
        applyTerminalGuestPhase("auth_event:SIGNED_OUT:converged_terminal");
        wipeAfterConfirmedTerminalSignedOut(result);
      })
      .finally(() => {
        settleUnexpectedSignedOutRecovery(generation);
      });
    return;
  }
  if (!session?.user?.id && event === "INITIAL_SESSION") {
    establishRecoverableGuestAuthState(`auth_event:${event}`);
    setSessionPhase("recovering");
    logGuestAuthBootMarker("session_recovering", { source: `auth_event:${event}` });
    return;
  }
  if (session?.user?.id) {
    applyAuthenticatedPhase(`auth_event:${event}`, session.user.id);
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
    establishRecoverableGuestAuthState("bindAuthListener:no_client");
    setSessionPhase("recovering");
    return () => {};
  }

  authListenerBound = true;
  const { data: { subscription } } = sb.auth.onAuthStateChange(dispatchAuthStateChange);
  authSubscription = subscription;

  const detachGuestRecovery = registerRecoverableGuestRecoveryBootstrap();
  void ensureSessionHealthy("bindAuthListener");

  return () => {
    subscription.unsubscribe();
    detachGuestRecovery();
    authListenerBound = false;
    authSubscription = null;
  };
}

/** 테스트·dev reset */
export function resetDibaySessionManagerForTests(): void {
  sessionPhase = "loading";
  resetGuestAuthStateForTests();
  resetUnexpectedSignedOutRecoveryForTests();
  authListenerBound = false;
  authSubscription = null;
  authEventHandlers.clear();
  remoteRefreshLock = false;
  explicitLogoutBroadcastHandled = false;
  try {
    authBc?.close();
  } catch {
    /* ignore */
  }
  authBc = null;
}
