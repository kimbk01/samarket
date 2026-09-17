import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  communityMessengerRoomIsVisibleInMainChatInbox,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessengerRoomListSource } from "@/lib/community-messenger/messenger-entry-origin";

export type GlobalSearchChatKind = "direct" | "group" | "trade" | "order";

export type GlobalSearchChatHit = {
  room: CommunityMessengerRoomSummary;
  kind: GlobalSearchChatKind;
  listSource: MessengerRoomListSource;
  preview: string;
};

export type ChatSearchAdapterResult =
  | { ok: true; hits: GlobalSearchChatHit[]; unauthorized: boolean }
  | { ok: false };

export function classifyGlobalSearchChatRoom(
  room: CommunityMessengerRoomSummary
): GlobalSearchChatKind | null {
  if (!communityMessengerRoomIsVisibleInMainChatInbox(room)) return null;
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  if (communityMessengerRoomIsConfirmedDelivery(room)) return "order";
  if (room.roomType === "private_group" || room.roomType === "open_group") return "group";
  if (room.roomType === "direct") return "direct";
  return null;
}

export function listSourceForGlobalSearchChatKind(kind: GlobalSearchChatKind): MessengerRoomListSource {
  if (kind === "trade") return "trade";
  if (kind === "order") return "delivery";
  return "inbox";
}

function roomMatchesKeyword(room: CommunityMessengerRoomSummary, keyword: string): boolean {
  const hay = [room.title, room.subtitle, room.summary, room.lastMessage]
    .join(" ")
    .toLowerCase();
  return hay.includes(keyword);
}

export function filterMembershipRoomsForGlobalSearch(
  rooms: CommunityMessengerRoomSummary[],
  q: string
): GlobalSearchChatHit[] {
  const keyword = q.trim().toLowerCase();
  if (!keyword) return [];
  const out: GlobalSearchChatHit[] = [];
  for (const room of rooms) {
    const kind = classifyGlobalSearchChatRoom(room);
    if (!kind) continue;
    if (!roomMatchesKeyword(room, keyword)) continue;
    out.push({
      room,
      kind,
      listSource: listSourceForGlobalSearchChatKind(kind),
      preview: (room.lastMessage || room.summary || room.subtitle || "").trim(),
    });
    if (out.length >= 24) break;
  }
  return out;
}

export async function searchChatForGlobal(
  q: string,
  signal: AbortSignal
): Promise<ChatSearchAdapterResult> {
  const keyword = q.trim();
  if (!keyword) return { ok: true, hits: [], unauthorized: false };
  try {
    const res = await fetch("/api/community-messenger/rooms", {
      cache: "no-store",
      credentials: "include",
      signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: true, hits: [], unauthorized: true };
    }
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as {
      ok?: boolean;
      chats?: CommunityMessengerRoomSummary[];
      groups?: CommunityMessengerRoomSummary[];
    };
    const rooms = [...(Array.isArray(json.chats) ? json.chats : []), ...(Array.isArray(json.groups) ? json.groups : [])];
    return { ok: true, hits: filterMembershipRoomsForGlobalSearch(rooms, keyword), unauthorized: false };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
