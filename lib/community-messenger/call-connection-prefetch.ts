"use client";

import { fetchGroupAgoraConnection } from "@/lib/community-messenger/call-provider/group-agora-session";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

const PREFETCH_MAX_AGE_MS = 90_000;

async function warmCommunityMessengerCallProviderBundle(): Promise<void> {
  await import("@/lib/community-messenger/call-provider/client").catch(() => {});
}

type PrefetchSlot = {
  connection: CommunityMessengerManagedCallConnection | null;
  promise: Promise<CommunityMessengerManagedCallConnection> | null;
  fetchedAt: number;
};

const prefetchBySessionId = new Map<string, PrefetchSlot>();

function normalizeSessionId(sessionId: string): string {
  return sessionId.trim();
}

/** ringing·active 동안 Agora SDK + `/token` 단일 비행 prefetch (수신 벨·CallClient 공용) */
export function primeCommunityMessengerCallConnectionPrefetch(sessionId: string): void {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return;
  const existing = prefetchBySessionId.get(sid);
  if (existing?.promise || existing?.connection) return;

  void warmCommunityMessengerCallProviderBundle();

  const promise = fetchGroupAgoraConnection(sid)
    .then((connection) => {
      if (!connection) {
        prefetchBySessionId.delete(sid);
        throw new Error("call_token_prefetch_empty");
      }
      prefetchBySessionId.set(sid, {
        connection,
        promise: null,
        fetchedAt: Date.now(),
      });
      return connection;
    })
    .catch(() => {
      prefetchBySessionId.delete(sid);
      throw new Error("call_token_prefetch_failed");
    });

  prefetchBySessionId.set(sid, {
    connection: null,
    promise,
    fetchedAt: Date.now(),
  });
  void promise.catch(() => {
    /* best-effort warm — join 시 fetchFresh 로 fallback */
  });
}

export function peekPrefetchedCommunityMessengerCallConnection(
  sessionId: string
): CommunityMessengerManagedCallConnection | null {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return null;
  const slot = prefetchBySessionId.get(sid);
  if (!slot?.connection) return null;
  if (Date.now() - slot.fetchedAt > PREFETCH_MAX_AGE_MS) {
    prefetchBySessionId.delete(sid);
    return null;
  }
  return slot.connection;
}

export function clearCommunityMessengerCallConnectionPrefetch(sessionId: string): void {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return;
  prefetchBySessionId.delete(sid);
}

/**
 * join 직전 connection — CallClient ref → 모듈 prefetch → fresh fetch 순.
 * ringing 단계 prefetch 를 join 에서 버리지 않는다 (Telegram-style warm token).
 */
export async function resolveCommunityMessengerCallConnection(args: {
  sessionId: string;
  prefetchedRef?: { current: CommunityMessengerManagedCallConnection | null };
  fetchFresh: () => Promise<CommunityMessengerManagedCallConnection>;
}): Promise<CommunityMessengerManagedCallConnection> {
  const sid = normalizeSessionId(args.sessionId);
  const fromRef = args.prefetchedRef?.current ?? null;
  if (fromRef) {
    args.prefetchedRef!.current = null;
    clearCommunityMessengerCallConnectionPrefetch(sid);
    return fromRef;
  }

  const peeked = peekPrefetchedCommunityMessengerCallConnection(sid);
  if (peeked) {
    clearCommunityMessengerCallConnectionPrefetch(sid);
    return peeked;
  }

  const slot = prefetchBySessionId.get(sid);
  if (slot?.promise && Date.now() - slot.fetchedAt <= PREFETCH_MAX_AGE_MS) {
    try {
      const connection = await slot.promise;
      clearCommunityMessengerCallConnectionPrefetch(sid);
      return connection;
    } catch {
      /* fresh fetch below */
    }
  }

  const fresh = await args.fetchFresh();
  clearCommunityMessengerCallConnectionPrefetch(sid);
  return fresh;
}
