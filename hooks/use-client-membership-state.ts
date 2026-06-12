"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  resolveClientMembership,
  type ClientMembershipResolution,
} from "@/lib/auth/resolve-client-profile-session";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { ensureSessionHealthy } from "@/lib/auth/dibay-session-manager";

export type ClientMembershipState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "member"; profile: Profile };

type MembershipStoreSnapshot = {
  state: ClientMembershipState;
  revision: number;
};

let storeSnapshot: MembershipStoreSnapshot = {
  state: { status: "checking" },
  revision: 0,
};
let inflight: Promise<ClientMembershipState> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

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

async function resolveMembershipState(source: string): Promise<ClientMembershipState> {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };

  const health = await ensureSessionHealthy(`membership:${source}`);
  if (health.phase === "loading") {
    return { status: "checking" };
  }
  if (health.ok === false && health.terminal) {
    return { status: "guest" };
  }

  const resolved: ClientMembershipResolution = await resolveClientMembership(source);
  return resolved;
}

function scheduleMembershipRetry(source: string, delayMs: number): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    inflight = null;
    ensureMembershipResolved(source);
  }, delayMs);
}

function ensureMembershipResolved(source: string): void {
  const cachedState = membershipFromCache();
  if (cachedState.status === "member") {
    if (storeSnapshot.state.status !== "member") publish(cachedState);
    return;
  }

  if (inflight) return;

  publish({ status: "checking" });
  inflight = resolveMembershipState(source)
    .then((next) => {
      publish(next);
      if (next.status === "checking") {
        scheduleMembershipRetry(source, 1_200);
      }
      return next;
    })
    .catch(() => {
      publish({ status: "checking" });
      scheduleMembershipRetry(source, 1_500);
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
  const cached = getCurrentUser();
  if (cached?.id) {
    publish({ status: "member", profile: cached });
    return;
  }
  ensureMembershipResolved(source);
}

let authListenerBound = false;

function bindGlobalAuthListener(): void {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;
  window.addEventListener(TEST_AUTH_CHANGED_EVENT, () => {
    resetMembershipStoreForAuthChange("client-membership-store");
  });
}

export function useClientMembershipState(source: string): ClientMembershipState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    bindGlobalAuthListener();
    ensureMembershipResolved(source);
  }, [source]);

  return snapshot.state;
}
