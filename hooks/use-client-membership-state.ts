"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types/profile";
import { awaitAuthBootstrapInitialSession } from "@/lib/auth/auth-bootstrap-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  resolveClientMembership,
  type ClientMembershipResolution,
} from "@/lib/auth/resolve-client-profile-session";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";

export type ClientMembershipState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "member"; profile: Profile };

type MembershipStoreSnapshot = {
  state: ClientMembershipState;
  revision: number;
};

const MEMBERSHIP_CHECK_RETRY_MS = 800;
const MEMBERSHIP_ERROR_RETRY_MS = 1_500;

let storeSnapshot: MembershipStoreSnapshot = {
  state: { status: "checking" },
  revision: 0,
};
let inflight: Promise<ClientMembershipState> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function logMembership(event: string, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(`[membership] ${event}`, JSON.stringify({ at: Date.now(), ...payload }));
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
  return () => listeners.delete(listener);
}

function getSnapshot(): MembershipStoreSnapshot {
  return storeSnapshot;
}

function mapResolution(
  resolved: ClientMembershipResolution,
): ClientMembershipState {
  if (resolved.status === "pending") return { status: "checking" };
  return resolved;
}

async function resolveMembershipState(source: string): Promise<ClientMembershipState> {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };

  await awaitAuthBootstrapInitialSession();

  const t0 = performance.now();
  logMembership("resolve_start", { source });

  const resolved = await resolveClientMembership(source);
  const next = mapResolution(resolved);

  logMembership("resolve_done", {
    source,
    status: next.status,
    duration_ms: Math.round(performance.now() - t0),
  });

  return next;
}

function scheduleMembershipRetry(source: string, delayMs: number): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    inflight = null;
    ensureMembershipResolved(source);
  }, delayMs);
}

function syncMembershipFromProfileCache(): boolean {
  const cachedState = membershipFromCache();
  if (cachedState.status === "member") {
    if (storeSnapshot.state.status !== "member") publish(cachedState);
    return true;
  }
  return false;
}

function ensureMembershipResolved(source: string): void {
  if (syncMembershipFromProfileCache()) return;

  if (inflight) return;

  if (storeSnapshot.state.status !== "checking") {
    publish({ status: "checking" });
  }

  inflight = resolveMembershipState(source)
    .then((next) => {
      if (syncMembershipFromProfileCache()) {
        return membershipFromCache();
      }
      publish(next);
      if (next.status === "checking") {
        scheduleMembershipRetry(source, MEMBERSHIP_CHECK_RETRY_MS);
      }
      return next;
    })
    .catch(() => {
      if (syncMembershipFromProfileCache()) {
        return membershipFromCache();
      }
      if (storeSnapshot.state.status !== "checking") {
        publish({ status: "checking" });
      }
      scheduleMembershipRetry(source, MEMBERSHIP_ERROR_RETRY_MS);
      return { status: "checking" } as const;
    })
    .finally(() => {
      inflight = null;
    });
}

function resetMembershipStoreForAuthChange(source: string): void {
  inflight = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (syncMembershipFromProfileCache()) return;
  ensureMembershipResolved(source);
}

/** Supabase reconcile·프로필 캐시 확정 직후 membership 즉시 동기화 */
export function publishMembershipFromReconcile(source: string): void {
  const cached = getCurrentUser();
  if (cached?.id) {
    logMembership("publish_member_from_reconcile", { source, userId: cached.id });
    inflight = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    publish({ status: "member", profile: cached });
    return;
  }
  resetMembershipStoreForAuthChange(source);
}

let authListenerBound = false;

function bindGlobalAuthListener(): void {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;
  window.addEventListener(TEST_AUTH_CHANGED_EVENT, () => {
    resetMembershipStoreForAuthChange("client-membership-store");
  });
  syncMembershipFromProfileCache();
}

export function useClientMembershipState(source: string): ClientMembershipState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    bindGlobalAuthListener();
    ensureMembershipResolved(source);
  }, [source]);

  return snapshot.state;
}

export function peekClientMembershipStateForTests(): ClientMembershipState {
  return storeSnapshot.state;
}

/** vitest — store 초기화 */
export function resetClientMembershipStoreForTests(): void {
  inflight = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  storeSnapshot = { state: { status: "checking" }, revision: 0 };
  authListenerBound = false;
  listeners.clear();
}
