"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types/profile";
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
      return next;
    })
    .catch(() => {
      if (syncMembershipFromProfileCache()) {
        return membershipFromCache();
      }
      if (storeSnapshot.state.status !== "checking") {
        publish({ status: "checking" });
      }
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
  if (syncMembershipFromProfileCache()) return;
  ensureMembershipResolved(source);
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
