/**
 * 채팅 목록 탭(trade | order) — 동시 요청 합류(탭 전환·폴링·이벤트가 겹칠 때).
 */
import type { ChatRoom } from "@/lib/types/chat";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export function fetchChatRoomsBySegment(segment: "trade" | "order"): Promise<{
  ok: boolean;
  status: number;
  rooms: ChatRoom[];
}> {
  return runSingleFlight(`chat:rooms-list:${segment}`, async () => {
    try {
      const res = await fetch(`/api/chat/rooms?segment=${encodeURIComponent(segment)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        return { ok: true, status: 401, rooms: [] };
      }
      if (!res.ok) {
        return { ok: false, status: res.status, rooms: [] };
      }
      const j = (await res.json()) as { rooms?: ChatRoom[] };
      return { ok: true, status: res.status, rooms: Array.isArray(j.rooms) ? j.rooms : [] };
    } catch {
      return { ok: false, status: 0, rooms: [] };
    }
  });
}
