"use client";

import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";

const TTL_MS = 10_000;
const CM_PRESENCE_SNAPSHOT_CACHE_MAX_KEYS = 200;
const cache = new Map<string, { expiresAt: number; value: CommunityMessengerPeerPresenceSnapshot | null }>();

export async function fetchCommunityMessengerPresenceSnapshotClient(
  userId: string
): Promise<CommunityMessengerPeerPresenceSnapshot | null> {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;
  return runSingleFlight(`cm:presence-snapshot:${id}`, async () => {
    const again = cache.get(id);
    if (again && again.expiresAt > Date.now()) return again.value;
    try {
      const res = await fetch(`/api/community-messenger/presence?userIds=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        snapshots?: CommunityMessengerPeerPresenceSnapshot[];
      };
      const value =
        res.ok && json.ok && Array.isArray(json.snapshots) && json.snapshots.length > 0 ? (json.snapshots[0] ?? null) : null;
      cache.set(id, { value, expiresAt: Date.now() + TTL_MS });
      pruneByExpiresAtAndMaxSize(cache, Date.now(), CM_PRESENCE_SNAPSHOT_CACHE_MAX_KEYS);
      return value;
    } catch {
      return null;
    }
  });
}
