/**
 * Bottom Chat eligibility (GD + group + trade + customer store-order).
 * Live absolute recount lives in messenger-room-unread-authority (not ±1).
 * DO NOT: include owner store-order · Bell/App Icon · Native Call · revive delta bumps.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { getDomainListProjection } from "@/lib/chat-domain/list/domain-list-writers";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  communityMessengerRoomInboxGroupKind,
  isMessengerCommerceDirectKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";

const BOTTOM_CHAT_DOMAINS: ReadonlySet<ChatDomain> = new Set([
  "general_direct",
  "group",
  "trade",
  "store_order",
]);

/** Pure: does this room summary count toward the Member Conversation B room count? */
export function roomSummaryCountsForBottomChat(
  room: Pick<
    CommunityMessengerRoomSummary,
    "chatDomain" | "roomType" | "messengerDirectKey" | "contextMeta"
  > & { storeOrderRole?: "customer" | "owner" | null },
): boolean {
  const domain = room.chatDomain ?? null;
  if (domain === "general_direct" || domain === "group" || domain === "trade") return true;
  if (domain === "store_order") return room.storeOrderRole === "customer";

  if (isCommunityMessengerGroupRoomType(room.roomType)) return true;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  return communityMessengerRoomInboxGroupKind(room as CommunityMessengerRoomSummary) === "general";
}

/**
 * Resolve from caches. `null` = Domain unknown (exclude from Bottom recount only;
 * list/fact still update). Prefer home bootstrap over domain-list-only miss.
 */
export function resolveBottomChatRoomEligible(
  roomId: string,
  viewerUserId: string,
): boolean | null {
  const rid = roomId.trim();
  const viewer = viewerUserId.trim();
  if (!rid || !viewer) return null;

  const snap = peekRoomSnapshot(rid, viewer);
  if (snap?.room) return roomSummaryCountsForBottomChat(snap.room);

  const homeRow = findHomeListRoomRow(peekBootstrapCache(), rid);
  if (homeRow) return roomSummaryCountsForBottomChat(homeRow);

  for (const d of ["general_direct", "group", "trade", "store_order"] as const) {
    const proj = getDomainListProjection(d);
    const hit = proj?.items.find((i) => i.roomId.trim().toLowerCase() === rid.toLowerCase());
    if (hit) {
      return (
        BOTTOM_CHAT_DOMAINS.has(d) &&
        (d !== "store_order" || hit.storeOrderRole === "customer")
      );
    }
  }

  return null;
}
