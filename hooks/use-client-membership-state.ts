"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
      return next;
    })
    .catch(() => {
      publish({ status: "guest" });
      return { status: "guest" } as const;
    })
    .finally(() => {
      inflight = null;
    });
}

function resetMembershipStoreForAuthChange(source: string): void {
  inflight = null;
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

/**
 * 화면 게스트/회원 분기 — 캐시만으로 비회원 판정하지 않는다.
 * 동일 탭 다중 구독자는 단일 store·단일 resolve 비행을 공유한다.
 */
export function useClientMembershipState(source: string): ClientMembershipState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    bindGlobalAuthListener();
    ensureMembershipResolved(source);
  }, [source]);

  return snapshot.state;
}
