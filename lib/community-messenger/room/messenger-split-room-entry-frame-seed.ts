import type { MessengerRoomListSource } from "@/lib/community-messenger/messenger-entry-origin";
import { getRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * 진입 틀 상단바에 이름·사진을 넣을 방 — 일반 대화 목록(inbox)에서 누른 1:1(direct) 방만 (F1, 2026-11-07).
 * 목록 요약에는 chatDomain 이 없어(운영 실측) 방 종류 + 목록 출처로 판정한다.
 * 거래·배달 목록(상품·매장 상단바)·그룹(그룹 사진)은 실제 상단바 모양이 달라 제외.
 */
export function isMessengerSplitFrameDirectHeaderRoom(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "chatDomain">,
  listSource: MessengerRoomListSource
): boolean {
  if (listSource !== "inbox" || room.roomType !== "direct") return false;
  const domain = room.chatDomain ?? null;
  return domain == null || domain === "general_direct";
}

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
    splitFrameHeader: seed.splitFrameHeader ?? null,
  });
}

/**
 * 일반 1:1 방만 이름·사진을 쓴다 — 실제 상단바가 같은 배치(사진 36px + 제목)인 경우.
 * 판정: 진입 의도의 `splitFrameHeader === "direct"`(목록 출처 inbox + direct) 또는 `expectedDomain === "general_direct"`.
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
      splitFrameHeader?: unknown;
    };
    const direct =
      parsed.splitFrameHeader === "direct" ||
      (parsed.splitFrameHeader == null && parsed.expectedDomain === "general_direct");
    if (!direct) return null;
    if (parsed.expectedDomain != null && parsed.expectedDomain !== "general_direct") return null;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    if (!title) return null;
    const avatarUrl = typeof parsed.avatarUrl === "string" && parsed.avatarUrl.trim() ? parsed.avatarUrl : null;
    return { title, avatarUrl };
  } catch {
    return null;
  }
}
