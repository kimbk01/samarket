import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const TTL_MS = 60_000;
const entries = new Map<string, { snapshot: CommunityMessengerRoomSnapshot; at: number }>();

export function primeRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot) {
  entries.set(roomId, { snapshot, at: Date.now() });
}

export function peekRoomSnapshot(roomId: string): CommunityMessengerRoomSnapshot | null {
  const row = entries.get(roomId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    entries.delete(roomId);
    return null;
  }
  return row.snapshot;
}

/** 한 번만 꺼내 쓰고 제거(중복 GET 없이 첫 페인트용). */
export function consumeRoomSnapshot(roomId: string): CommunityMessengerRoomSnapshot | null {
  const row = entries.get(roomId);
  if (!row) return null;
  entries.delete(roomId);
  if (Date.now() - row.at > TTL_MS) return null;
  return row.snapshot;
}

/** 호버 등으로 미리 채워 두면 방 진입 시 로딩이 거의 없어짐. */
export async function prefetchCommunityMessengerRoomSnapshot(roomId: string): Promise<boolean> {
  if (peekRoomSnapshot(roomId)) return true;
  try {
    const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean } & Partial<CommunityMessengerRoomSnapshot>;
    if (res.ok && json.ok && json.viewerUserId) {
      primeRoomSnapshot(roomId, json as CommunityMessengerRoomSnapshot);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
