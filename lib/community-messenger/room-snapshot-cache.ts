import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 60_000;
// 프리패치 캐시가 누적되며 메모리를 잠식하지 않도록 상한을 둔다.
const MAX_ENTRIES = 120;
const entries = new Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>();

function pruneIfNeeded(now = Date.now()): void {
  // TTL 초과 먼저 정리
  for (const [k, v] of entries) {
    if (now - v.at > TTL_MS) entries.delete(k);
  }
  if (entries.size <= MAX_ENTRIES) return;
  // 오래된 순으로 제거(Map iteration order는 insertion order)
  const overflow = entries.size - MAX_ENTRIES;
  let i = 0;
  for (const k of entries.keys()) {
    entries.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

export function primeRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot) {
  entries.set(roomId, { snapshot, at: Date.now() });
  pruneIfNeeded();
}

export function peekRoomSnapshot(roomId: string): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const row = entries.get(roomId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    entries.delete(roomId);
    return null;
  }
  return row.snapshot;
}

/** 방 입장 전 프리패치 캐시 무효화(목록에서 로컬 미리보기 정리 등). */
export function invalidateRoomSnapshot(roomId: string): void {
  entries.delete(roomId);
}

/** 한 번만 꺼내 쓰고 제거(중복 GET 없이 첫 페인트용). */
export function consumeRoomSnapshot(roomId: string): CommunityMessengerRoomSnapshot | null {
  pruneIfNeeded();
  const row = entries.get(roomId);
  if (!row) return null;
  entries.delete(roomId);
  if (Date.now() - row.at > TTL_MS) return null;
  return row.snapshot;
}

/** 호버 등으로 미리 채워 두면 방 진입 시 로딩이 거의 없어짐. */
export async function prefetchCommunityMessengerRoomSnapshot(roomId: string): Promise<boolean> {
  const key = roomId.trim();
  if (!key) return false;
  if (peekRoomSnapshot(key)) return true;
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
