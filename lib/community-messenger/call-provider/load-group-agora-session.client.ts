"use client";

import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

/**
 * CONTRACT — browser-only Agora chain entry.
 * `group-agora-session` → `call-camera-switch` → `agora-rtc-sdk-ng` must never be
 * statically imported from app shell / SSR paths. Use this loader inside dynamic
 * import or call prefetch/join handlers only.
 */
export type FetchGroupAgoraConnectionFn = (
  sessionId: string
) => Promise<CommunityMessengerManagedCallConnection | null>;

export async function loadFetchGroupAgoraConnection(): Promise<FetchGroupAgoraConnectionFn> {
  const mod = await import("@/lib/community-messenger/call-provider/group-agora-session");
  return mod.fetchGroupAgoraConnection;
}
