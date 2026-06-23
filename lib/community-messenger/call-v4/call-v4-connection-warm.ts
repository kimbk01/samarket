"use client";

import {
  clearCommunityMessengerCallConnectionPrefetch,
  primeCommunityMessengerCallConnectionPrefetch,
  resolveCommunityMessengerCallConnection,
} from "@/lib/community-messenger/call-connection-prefetch";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

/** Ringing callee — warm Agora bundle + `/token` single-flight (Telegram-style). */
export function primeCallV4ConnectionWarm(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  logCallV4("connection_warm_start", { callId: sid });
  primeCommunityMessengerCallConnectionPrefetch(sid);
}

export function clearCallV4ConnectionWarm(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  clearCommunityMessengerCallConnectionPrefetch(sid);
}

export async function resolveCallV4WarmConnection(
  callId: string,
  fetchFresh: () => Promise<CommunityMessengerManagedCallConnection | null>,
): Promise<CommunityMessengerManagedCallConnection | null> {
  const sid = callId.trim();
  if (!sid) return null;
  try {
    const connection = await resolveCommunityMessengerCallConnection({
      sessionId: sid,
      fetchFresh: async () => {
        const fresh = await fetchFresh();
        if (!fresh) throw new Error("call_v4_token_empty");
        return fresh;
      },
    });
    logCallV4("token_fetch_done", { callId: sid, warmed: true });
    return connection;
  } catch {
    return null;
  }
}
