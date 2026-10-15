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

/** `GET /api/community-messenger/presence` 가 한 요청에서 받는 최대 userIds (route `.slice(0, 24)`) */
export const CM_PRESENCE_SNAPSHOT_API_MAX_IDS = 24;

/**
 * 여러 userId 를 24개 단위 배치로 조회 — 행마다 1건씩 요청하지 않는다.
 * 10초 TTL 캐시 히트는 재요청하지 않고, 응답은 단건 API 와 같은 캐시에 기록한다.
 * 실패한 청크의 id 는 결과 Map 에서 빠진다(호출측이 기존 표시 유지).
 */
export async function fetchCommunityMessengerPresenceSnapshotsBatchClient(
  userIds: readonly string[]
): Promise<Map<string, CommunityMessengerPeerPresenceSnapshot>> {
  const out = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  const now = Date.now();
  const misses: string[] = [];
  for (const raw of new Set(userIds.map((u) => String(u ?? "").trim()).filter(Boolean))) {
    const hit = cache.get(raw);
    if (hit && hit.expiresAt > now) {
      if (hit.value) out.set(raw, hit.value);
    } else {
      misses.push(raw);
    }
  }
  const chunks: string[][] = [];
  for (let i = 0; i < misses.length; i += CM_PRESENCE_SNAPSHOT_API_MAX_IDS) {
    chunks.push(misses.slice(i, i + CM_PRESENCE_SNAPSHOT_API_MAX_IDS));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(
          `/api/community-messenger/presence?userIds=${chunk.map((id) => encodeURIComponent(id)).join(",")}`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          snapshots?: CommunityMessengerPeerPresenceSnapshot[];
        };
        if (!res.ok || !json.ok || !Array.isArray(json.snapshots)) return;
        const expiresAt = Date.now() + TTL_MS;
        for (const snap of json.snapshots) {
          const id = typeof snap?.userId === "string" ? snap.userId.trim() : "";
          if (!id) continue;
          out.set(id, snap);
          cache.set(id, { value: snap, expiresAt });
        }
        pruneByExpiresAtAndMaxSize(cache, Date.now(), CM_PRESENCE_SNAPSHOT_CACHE_MAX_KEYS);
      } catch {
        /* 네트워크 실패 — 해당 청크는 결과에서 제외 */
      }
    })
  );
  return out;
}
