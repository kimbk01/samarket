import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  communityMessengerRoomIsVisibleInMainChatInbox,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessengerRoomListSource } from "@/lib/community-messenger/messenger-entry-origin";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import {
  matchChatGlobalSearch,
  type GlobalSearchChatField,
} from "@/lib/search/global/semantics/domain-fields";
import { buildMatchedSnippet } from "@/lib/search/global/semantics/match";

export type GlobalSearchChatKind = "direct" | "group" | "trade" | "order";

export type GlobalSearchChatHit = {
  room: CommunityMessengerRoomSummary;
  kind: GlobalSearchChatKind;
  listSource: MessengerRoomListSource;
  preview: string;
  matchedField: GlobalSearchChatField;
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

function roomPreviewForMatch(
  room: CommunityMessengerRoomSummary,
  matchedField: GlobalSearchChatField,
  query: string
): string {
  if (matchedField === "title") {
    return (room.lastMessage || room.summary || room.subtitle || "").trim();
  }
  const source =
    matchedField === "lastMessage"
      ? room.lastMessage
      : matchedField === "summary"
        ? room.summary
        : room.subtitle;
  return buildMatchedSnippet(source ?? "", query);
}

export function filterMembershipRoomsForGlobalSearch(
  rooms: CommunityMessengerRoomSummary[],
  q: string
): GlobalSearchChatHit[] {
  if (!isSearchableGlobalQuery(q)) return [];
  const out: GlobalSearchChatHit[] = [];
  for (const room of rooms) {
    const kind = classifyGlobalSearchChatRoom(room);
    if (!kind) continue;
    const match = matchChatGlobalSearch(room, q);
    if (!match.matched || match.matchedField === "NONE") continue;
    out.push({
      room,
      kind,
      listSource: listSourceForGlobalSearchChatKind(kind),
      preview: roomPreviewForMatch(room, match.matchedField, q),
      matchedField: match.matchedField,
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
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { ok: true, hits: [], unauthorized: false };
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
