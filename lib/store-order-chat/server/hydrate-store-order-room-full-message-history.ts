import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { listCommunityMessengerRoomMessagesBefore } from "@/lib/community-messenger/service";

const STORE_ORDER_ROOM_HISTORY_MAX_PAGES = 12;

function mergeChronologicalMessages(
  prev: CommunityMessengerMessage[],
  older: CommunityMessengerMessage[]
): CommunityMessengerMessage[] {
  const byId = new Map<string, CommunityMessengerMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of older) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, ...m } : m);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return merged;
}

/**
 * 주문 방 — bootstrap 시드(최근 N건) 뒤 이전 페이지를 서버에서 합쳐 **한 응답**으로 내려준다.
 * 매장 슬라이드·구매자 URL 모두 동일 full history 계약.
 */
export async function hydrateStoreOrderRoomFullMessageHistory(
  userId: string,
  roomId: string,
  snapshot: CommunityMessengerRoomSnapshot
): Promise<CommunityMessengerRoomSnapshot> {
  const meta = snapshot.room.contextMeta;
  if (meta?.kind !== "delivery") return snapshot;

  let messages = [...(snapshot.messages ?? [])];
  let hasMore = snapshot.hasMoreOlderMessages === true;
  let pages = 0;

  while (hasMore && pages < STORE_ORDER_ROOM_HISTORY_MAX_PAGES) {
    const oldest = messages[0];
    const beforeId = oldest?.id?.trim();
    if (!beforeId) break;

    const page = await listCommunityMessengerRoomMessagesBefore({
      userId,
      roomId,
      beforeMessageId: beforeId,
    });
    if (!page.ok || page.messages.length === 0) {
      hasMore = false;
      break;
    }

    messages = mergeChronologicalMessages(messages, page.messages);
    hasMore = page.hasMore;
    pages += 1;
  }

  return {
    ...snapshot,
    messages,
    hasMoreOlderMessages: hasMore,
  };
}
