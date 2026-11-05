import { isRoomLeftLocally } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** 한 번의 home-sync critical 응답에서 단건 요약으로 불러올 최대 그룹 수 */
export const HOME_LIST_MISSING_GROUP_FETCH_CAP = 5;

/**
 * 초대받은 그룹이 Realtime(insert broadcast·participant 변경)을 놓치면(앱 백그라운드 등) 목록에 끝내 안 생긴다 —
 * `critical_patch` 는 계약(M1a)상 모르는 방을 넣지 않고, 목록 복귀는 캐시 + critical_patch 만 쓰기 때문이다.
 * 서버 critical 목록(활성 참가 `left_at IS NULL`)에는 있는데 화면 목록에 없는 비공개 그룹 id 만 고른다.
 */
export function pickMissingPrivateGroupRoomIds(
  incomingGroups: readonly CommunityMessengerRoomSummary[] | undefined,
  base: Pick<CommunityMessengerBootstrap, "chats" | "groups"> | null | undefined
): string[] {
  if (!incomingGroups?.length || !base) return [];
  const known = new Set<string>();
  for (const r of base.chats ?? []) known.add(r.id);
  for (const r of base.groups ?? []) known.add(r.id);
  const out: string[] = [];
  for (const r of incomingGroups) {
    const id = String(r?.id ?? "").trim();
    if (!id || r.roomType !== "private_group" || known.has(id) || isRoomLeftLocally(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= HOME_LIST_MISSING_GROUP_FETCH_CAP) break;
  }
  return out;
}

/** 단건 서버 요약 — Realtime 누락 복구와 같은 `home-summary` 경로 */
export async function fetchHomeListRoomSummary(roomId: string): Promise<CommunityMessengerRoomSummary | null> {
  try {
    const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/home-summary`, {
      credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; room?: CommunityMessengerRoomSummary };
    if (!res.ok || !json.ok || !json.room) return null;
    return json.room;
  } catch {
    return null;
  }
}
