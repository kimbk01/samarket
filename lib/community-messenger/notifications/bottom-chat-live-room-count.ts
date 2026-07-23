/**
 * B1 — Bottom Chat live room-count eligibility (GD + group only).
 * Fail-closed when Domain unknown — do not bump hub CM (resync remains authority).
 * DO NOT: include trade/store_order · Bell/App Icon · Native Call.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { getDomainListProjection } from "@/lib/chat-domain/list/domain-list-writers";
import { applyHubBadgeCmUnreadRoomCountDelta } from "@/lib/chats/owner-hub-badge-store";
import {
  communityMessengerRoomInboxGroupKind,
  isMessengerCommerceDirectKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";

const BOTTOM_CHAT_DOMAINS: ReadonlySet<ChatDomain> = new Set(["general_direct", "group"]);

/** Pure: does this room summary count toward Bottom Chat (GD+group room count)? */
export function roomSummaryCountsForBottomChat(
  room: Pick<
    CommunityMessengerRoomSummary,
    "chatDomain" | "roomType" | "messengerDirectKey" | "contextMeta"
  >,
): boolean {
  const domain = room.chatDomain ?? null;
  if (domain === "general_direct" || domain === "group") return true;
  if (domain === "trade" || domain === "store_order") return false;

  if (isCommunityMessengerGroupRoomType(room.roomType)) return true;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  return communityMessengerRoomInboxGroupKind(room as CommunityMessengerRoomSummary) === "general";
}

/**
 * Resolve from caches. `null` = unknown → fail-closed (no live bump).
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

  for (const d of ["general_direct", "group", "trade", "store_order"] as const) {
    const proj = getDomainListProjection(d);
    const hit = proj?.items.some((i) => i.roomId.trim().toLowerCase() === rid.toLowerCase());
    if (hit) return BOTTOM_CHAT_DOMAINS.has(d);
  }

  return null;
}

export type BottomChatLiveDeltaResult =
  | "bumped"
  | "skipped_domain"
  | "skipped_transition"
  | "unknown_fail_closed";

/**
 * Apply ±1 to hub `communityMessengerUnread` only for GD/group room transitions
 * 0→>0 (+1) or >0→0 (−1). Always leave network resync to the caller.
 */
export function applyBottomChatLiveRoomCountDelta(opts: {
  roomId: string;
  viewerUserId: string;
  prevUnread: number;
  nextUnread: number;
}): BottomChatLiveDeltaResult {
  const eligible = resolveBottomChatRoomEligible(opts.roomId, opts.viewerUserId);
  if (eligible === null) return "unknown_fail_closed";
  if (!eligible) return "skipped_domain";

  const prev = Math.max(0, Math.floor(Number(opts.prevUnread) || 0));
  const next = Math.max(0, Math.floor(Number(opts.nextUnread) || 0));

  if (prev === 0 && next > 0) {
    applyHubBadgeCmUnreadRoomCountDelta(1);
    return "bumped";
  }
  if (prev > 0 && next === 0) {
    applyHubBadgeCmUnreadRoomCountDelta(-1);
    return "bumped";
  }
  return "skipped_transition";
}
