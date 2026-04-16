import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 60_000;
const MAX_ENTRIES = 120;
const entries = new Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>();

function cacheKey(roomId: string, viewerUserId: string | null | undefined): string {
  const r = roomId.trim();
  const v = (viewerUserId ?? "").trim() || "_";
  return `${v}:${r}`;
}

function pruneIfNeeded(now = Date.now()): void {
  for (const [k, v] of entries) {
    if (now - v.at > TTL_MS) entries.delete(k);
  }
  if (entries.size <= MAX_ENTRIES) return;
  const overflow = entries.size - MAX_ENTRIES;
  let i = 0;
  for (const k of entries.keys()) {
    entries.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

export function primeRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot) {
  const k = cacheKey(roomId, snapshot.viewerUserId);
  entries.set(k, { snapshot, at: Date.now() });
  pruneIfNeeded();
}

/**
 * @param viewerUserId 현재 로그인 사용자 id. 생략·빈 문자열이면 동일 `roomId` 로 끝나는 캐시 중 **가장 최근** 항목을 반환(프리패치 히트용).
 */
export function peekRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const k = cacheKey(r, viewerUserId.trim());
    const row = entries.get(k);
    if (!row) return null;
    if (Date.now() - row.at > TTL_MS) {
      entries.delete(k);
      return null;
    }
    return row.snapshot;
  }
  const suffix = `:${r}`;
  let best: { snapshot: CommunityMessengerRoomSnapshot; at: number } | null = null;
  for (const [k, row] of entries) {
    if (!k.endsWith(suffix)) continue;
    if (Date.now() - row.at > TTL_MS) {
      entries.delete(k);
      continue;
    }
    if (!best || row.at > best.at) best = row;
  }
  return best?.snapshot ?? null;
}

/** 방 id 에 해당하는 모든 뷰어 버킷 캐시 제거 */
export function invalidateRoomSnapshot(roomId: string): void {
  const suffix = `:${roomId.trim()}`;
  if (suffix.length <= 1) return;
  for (const k of Array.from(entries.keys())) {
    if (k.endsWith(suffix)) entries.delete(k);
  }
}

export function consumeRoomSnapshot(roomId: string, viewerUserId?: string | null): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const r = roomId.trim();
  if (!r) return null;
  if (typeof viewerUserId === "string" && viewerUserId.trim()) {
    const k = cacheKey(r, viewerUserId.trim());
    const row = entries.get(k);
    if (!row) return null;
    entries.delete(k);
    if (Date.now() - row.at > TTL_MS) return null;
    return row.snapshot;
  }
  const suffix = `:${r}`;
  for (const k of Array.from(entries.keys())) {
    if (!k.endsWith(suffix)) continue;
    const row = entries.get(k);
    if (!row) continue;
    entries.delete(k);
    if (Date.now() - row.at > TTL_MS) return null;
    return row.snapshot;
  }
  return null;
}

/** 호버 등으로 미리 채워 두면 방 진입 시 로딩이 거의 없어짐. */
export async function prefetchCommunityMessengerRoomSnapshot(roomId: string): Promise<boolean> {
  const key = roomId.trim();
  if (!key) return false;
  return runSingleFlight(`cm:prefetch-room-snapshot:${key}`, async () => {
    if (peekRoomSnapshot(key)) return true;
    try {
      const res = await fetch(communityMessengerRoomBootstrapPath(key), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const snap = parseCommunityMessengerRoomSnapshotResponse(json);
      if (res.ok && snap) {
        primeRoomSnapshot(key, snap);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });
}
