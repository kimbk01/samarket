import { getRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";

export type MessengerSplitRoomEntryFrameSeed = {
  title: string;
  avatarUrl: string | null;
};

/**
 * 분할 진입 틀 상단바에 넣을 이름·사진 — 목록에서 누를 때 저장한 진입 의도의 seed.
 * 반환값은 비교가 쉬운 문자열(useSyncExternalStore 스냅샷용). 없으면 null.
 */
export function readMessengerSplitRoomEntryFrameSeedRaw(roomId: string): string | null {
  const rid = roomId.trim();
  if (!rid) return null;
  const seed = getRoomEntryIntent(rid)?.seed;
  if (!seed) return null;
  return JSON.stringify({
    title: seed.title ?? null,
    avatarUrl: seed.avatarUrl ?? null,
    expectedDomain: seed.expectedDomain ?? null,
  });
}

/**
 * 일반 1:1 방(`general_direct`)만 이름·사진을 쓴다 — 실제 상단바가 같은 배치(사진 36px + 제목)인 경우.
 * 거래(상품 상단바)·배달(매장 상단바)·그룹(그룹 사진) 은 모양이 달라 틀에 넣으면 바뀌는 순간이 보이므로 null.
 */
export function readMessengerSplitRoomEntryFrameSeed(
  roomId: string,
  raw: string | null
): MessengerSplitRoomEntryFrameSeed | null {
  if (!roomId.trim() || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      title?: unknown;
      avatarUrl?: unknown;
      expectedDomain?: unknown;
    };
    if (parsed.expectedDomain !== "general_direct") return null;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    if (!title) return null;
    const avatarUrl = typeof parsed.avatarUrl === "string" && parsed.avatarUrl.trim() ? parsed.avatarUrl : null;
    return { title, avatarUrl };
  } catch {
    return null;
  }
}
