"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  resolveClientMembership,
  type ClientMembershipResolution,
} from "@/lib/auth/resolve-client-profile-session";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  ensureSessionHealthy,
  subscribeDibayAuthStateChange,
} from "@/lib/auth/dibay-session-manager";

export type ClientMembershipState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "member"; profile: Profile };

type MembershipStoreSnapshot = {
  state: ClientMembershipState;
  revision: number;
};

/**
 * P0-1 membership recovery retry 계약 (auth-recovery-failed terminal):
 * - 동일 recovery cycle 자동 재시도 최대 3회, exponential backoff 1.5s → 3s → 6s (+jitter)
 * - 3회 실패 → terminal(auth-recovery-failed): 자동 timer 재시도 금지
 *   (UI 상태명은 기존 "checking" 재사용 — 새 전역 상태 시스템 금지 계약)
 * - 새 recovery cycle 은 명시 이벤트에서만: SIGNED_IN·TOKEN_REFRESHED 성공·
 *   online 복귀·visibility hidden→visible·명시적 auth 변경(TEST_AUTH_CHANGED_EVENT)
 * - mount/remount 만으로 실패 카운터를 초기화하지 않는다 (module 단위 유지)
 * - 정상 guest(확정 비로그인)는 재시도 대상이 아니며 terminal 로 취급하지 않는다
 */
const MEMBERSHIP_RETRY_BACKOFF_MS = [1_500, 3_000, 6_000] as const;
const MEMBERSHIP_RETRY_JITTER_MAX_MS = 200;
const MEMBERSHIP_MAX_RETRY_ATTEMPTS = MEMBERSHIP_RETRY_BACKOFF_MS.length;

let storeSnapshot: MembershipStoreSnapshot = {
  state: { status: "checking" },
  revision: 0,
};
let inflight: Promise<ClientMembershipState> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

let recoveryGeneration = 0;
let recoveryAttempt = 0;
let recoveryTerminal = false;
let recoveryCycleStartedAt = 0;

function logMembershipRecovery(
  marker:
    | "auth_membership_recovery_start"
    | "auth_membership_recovery_retry"
    | "auth_membership_recovery_terminal"
    | "auth_membership_recovery_reset",
  detail?: Record<string, unknown>,
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  try {
    console.info(
      `[${marker}]`,
      JSON.stringify({
        at: Date.now(),
        recoveryGeneration,
        attempt: recoveryAttempt,
        maxAttempts: MEMBERSHIP_MAX_RETRY_ATTEMPTS,
        pathname: typeof location !== "undefined" ? location.pathname : null,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
        visibilityState: typeof document !== "undefined" ? document.visibilityState : null,
        elapsedMs: recoveryCycleStartedAt > 0 ? Date.now() - recoveryCycleStartedAt : 0,
        ...detail,
      }),
    );
  } catch {
    console.info(`[${marker}]`);
  }
}

function membershipFromCache(): ClientMembershipState {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };
  return { status: "checking" };
}

function publish(state: ClientMembershipState): void {
  storeSnapshot = { state, revision: storeSnapshot.revision + 1 };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // 마지막 구독자 unmount — pending retry timer cleanup (계약: unmount 시 timer 제거)
    if (listeners.size === 0 && retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}

function getSnapshot(): MembershipStoreSnapshot {
  return storeSnapshot;
}

async function resolveMembershipState(source: string): Promise<ClientMembershipState> {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };

  const health = await ensureSessionHealthy(`membership:${source}`);
  if (health.phase === "loading" || health.phase === "recovering") {
    return { status: "checking" };
  }
  if (health.ok === false && health.terminal) {
    return { status: "guest" };
  }
  if (health.phase === "terminal_guest") {
    return { status: "guest" };
  }

  const resolved: ClientMembershipResolution = await resolveClientMembership(source);
  return resolved;
}

/** member/guest 확정 — 현재 cycle 종료, 카운터 정리 (terminal 아님) */
function clearRecoveryCycleOnSettled(): void {
  recoveryAttempt = 0;
  recoveryTerminal = false;
  recoveryCycleStartedAt = 0;
}

function scheduleMembershipRetry(source: string): void {
  if (retryTimer || recoveryTerminal) return;
  if (recoveryAttempt >= MEMBERSHIP_MAX_RETRY_ATTEMPTS) {
    recoveryTerminal = true;
    logMembershipRecovery("auth_membership_recovery_terminal", { source });
    return;
  }
  const delayMs =
    MEMBERSHIP_RETRY_BACKOFF_MS[recoveryAttempt] +
    Math.floor(Math.random() * MEMBERSHIP_RETRY_JITTER_MAX_MS);
  recoveryAttempt += 1;
  logMembershipRecovery(
    recoveryAttempt === 1 ? "auth_membership_recovery_start" : "auth_membership_recovery_retry",
    { source, delayMs },
  );
  retryTimer = setTimeout(() => {
    retryTimer = null;
    inflight = null;
    void ensureMembershipResolved(source);
  }, delayMs);
}

function ensureMembershipResolved(source: string): Promise<ClientMembershipState> {
  const cachedState = membershipFromCache();
  if (cachedState.status === "member") {
    clearRecoveryCycleOnSettled();
    if (storeSnapshot.state.status !== "member") publish(cachedState);
    return Promise.resolve(cachedState);
  }

  if (inflight) return inflight;

  // terminal(auth-recovery-failed) — mount/remount 로는 새 resolve 를 시작하지 않는다.
  if (recoveryTerminal) return Promise.resolve(storeSnapshot.state);
  // backoff 대기 중 remount — timer 가 예정한 재시도를 기다린다 (즉시 재호출 금지).
  if (retryTimer) return Promise.resolve(storeSnapshot.state);

  if (recoveryCycleStartedAt <= 0) recoveryCycleStartedAt = Date.now();
  publish({ status: "checking" });
  inflight = resolveMembershipState(source)
    .then((next) => {
      publish(next);
      if (next.status === "checking") {
        scheduleMembershipRetry(source);
      } else {
        clearRecoveryCycleOnSettled();
      }
      return next;
    })
    .catch(() => {
      publish({ status: "checking" });
      scheduleMembershipRetry(source);
      return { status: "checking" } as const;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 명시 이벤트에서만 새 recovery cycle 시작 (generation 증가·카운터 초기화) */
function beginNewMembershipRecoveryCycle(reason: string): void {
  recoveryGeneration += 1;
  recoveryAttempt = 0;
  recoveryTerminal = false;
  recoveryCycleStartedAt = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  inflight = null;
  logMembershipRecovery("auth_membership_recovery_reset", { reason });
}

function resetMembershipStoreForAuthChange(reason: string): void {
  beginNewMembershipRecoveryCycle(reason);
  const cached = getCurrentUser();
  if (cached?.id) {
    publish({ status: "member", profile: cached });
    return;
  }
  void ensureMembershipResolved(reason);
}

/** online/visible 복귀 — terminal 상태였을 때만 새 cycle 1회 재개 */
function resumeMembershipRecoveryIfTerminal(reason: string): void {
  if (!recoveryTerminal) return;
  beginNewMembershipRecoveryCycle(reason);
  void ensureMembershipResolved(reason);
}

let authListenerBound = false;
let authListenerTeardowns: Array<() => void> = [];

function bindGlobalAuthListener(): void {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;

  const onTestAuthChanged = () => {
    resetMembershipStoreForAuthChange("client-membership-store");
  };
  window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChanged);

  const onOnline = () => resumeMembershipRecoveryIfTerminal("online");
  window.addEventListener("online", onOnline);

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      resumeMembershipRecoveryIfTerminal("visibility_visible");
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const unsubscribeAuthEvents = subscribeDibayAuthStateChange((event, session) => {
    if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user?.id) {
      resetMembershipStoreForAuthChange(`auth_event:${event}`);
    }
  });

  authListenerTeardowns = [
    () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChanged),
    () => window.removeEventListener("online", onOnline),
    () => document.removeEventListener("visibilitychange", onVisibilityChange),
    unsubscribeAuthEvents,
  ];
}

export function useClientMembershipState(source: string): ClientMembershipState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    bindGlobalAuthListener();
    void ensureMembershipResolved(source);
  }, [source]);

  return snapshot.state;
}

/** Stage 2 — boot flight 와 membership resolve 병렬 (shell render 는 차단하지 않음). */
export function primeMembershipOnBoot(): Promise<ClientMembershipState> {
  bindGlobalAuthListener();
  return ensureMembershipResolved("app_boot");
}

/** vitest — recovery 상태 관찰 (제품 코드에서 사용 금지) */
export function peekClientMembershipRecoveryForTests(): {
  generation: number;
  attempt: number;
  terminal: boolean;
  hasTimer: boolean;
  state: ClientMembershipState;
} {
  return {
    generation: recoveryGeneration,
    attempt: recoveryAttempt,
    terminal: recoveryTerminal,
    hasTimer: retryTimer != null,
    state: storeSnapshot.state,
  };
}

/** vitest — store 구독 (unmount cleanup 검증용) */
export function subscribeClientMembershipStoreForTests(listener: () => void): () => void {
  return subscribe(listener);
}

/** vitest reset */
export function resetClientMembershipStateForTests(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  inflight = null;
  listeners.clear();
  storeSnapshot = { state: { status: "checking" }, revision: 0 };
  recoveryGeneration = 0;
  recoveryAttempt = 0;
  recoveryTerminal = false;
  recoveryCycleStartedAt = 0;
  authListenerTeardowns.forEach((teardown) => {
    try {
      teardown();
    } catch {
      /* ignore */
    }
  });
  authListenerTeardowns = [];
  authListenerBound = false;
}
