/**
 * A safety net — exit-time room tip reconcile (no-op when B already correct).
 *
 * CONTRACT:
 * - roomId 1 only
 * - forward-only via projectRoomActivityToHomeList
 * - full refresh 0
 * - not the product tip authority
 */

import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  projectRoomActivityToHomeList,
  type RoomActivityProjectionResult,
  roomActivityFromMessengerMessage,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import {
  getMessengerRealtimeRoomMessages,
  normalizeMessengerRealtimeRoomId,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pickCanonicalLastMessage(messages: CommunityMessengerMessage[]): CommunityMessengerMessage | null {
  let best: CommunityMessengerMessage | null = null;
  let bestMs = -1;
  for (const m of messages) {
    if (!m || m.pending) continue;
    const id = trim(m.id);
    if (!id || id.startsWith("tmp_") || id.startsWith("optimistic_")) continue;
    const ms = new Date(m.createdAt).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs || (ms === bestMs && id > trim(best?.id))) {
      best = m;
      bestMs = ms;
    }
  }
  return best;
}

export type ReconcileExitedRoomSummaryResult = RoomActivityProjectionResult & {
  reconcile: "noop_aligned" | "recovered" | "skipped";
};

/**
 * Compare room timeline last canonical event vs hub tip; project only when home lags.
 */
export function reconcileExitedRoomSummary(args: {
  roomId: string;
  viewerUserId?: string | null;
}): ReconcileExitedRoomSummaryResult {
  const roomId = trim(args.roomId);
  const empty: ReconcileExitedRoomSummaryResult = {
    accepted: false,
    reason: "missing_room_id",
    source: "surface_reconcile",
    roomId: roomId || null,
    eventId: null,
    changedRoomCount: 0,
    listOrderChanged: false,
    nextBootstrap: peekBootstrapCache(),
    previousEventId: null,
    previousActivityAt: null,
    incomingActivityAt: null,
    reconcile: "skipped",
  };
  if (!roomId) return empty;

  const messages = getMessengerRealtimeRoomMessages(roomId);
  const last = pickCanonicalLastMessage(messages);
  if (!last) {
    return { ...empty, reason: "patch_noop", reconcile: "noop_aligned" };
  }

  const cache = peekBootstrapCache();
  const row = findHomeListRoomRow(cache, roomId);
  if (!row) {
    return { ...empty, reason: "room_missing", eventId: trim(last.id), reconcile: "skipped" };
  }

  const homeEventHint = trim(row.lastMessage);
  const homeAt = trim(row.lastMessageAt);
  const msgAt = trim(last.createdAt);
  const same =
    homeAt === msgAt &&
    (homeEventHint === trim(last.content) ||
      (last.messageType !== "text" && homeAt === msgAt));

  // Prefer eventId alignment when tip text already matches activity time.
  if (same) {
    return {
      ...empty,
      reason: "same_payload",
      eventId: trim(last.id),
      previousActivityAt: homeAt,
      incomingActivityAt: msgAt,
      reconcile: "noop_aligned",
    };
  }

  const homeMs = new Date(homeAt).getTime();
  const msgMs = new Date(msgAt).getTime();
  if (Number.isFinite(homeMs) && Number.isFinite(msgMs) && homeMs > msgMs) {
    return {
      ...empty,
      reason: "stale_activity_at",
      eventId: trim(last.id),
      previousActivityAt: homeAt,
      incomingActivityAt: msgAt,
      reconcile: "noop_aligned",
    };
  }

  const activity = roomActivityFromMessengerMessage({
    message: last,
    source: "surface_reconcile",
    boostUnread: false,
    viewerUserId: args.viewerUserId,
    chatDomain: row.chatDomain,
    domainIdentityKey: row.domainIdentityKey,
  });
  if (!activity) {
    return { ...empty, reason: "missing_preview", eventId: trim(last.id), reconcile: "skipped" };
  }

  const result = projectRoomActivityToHomeList(activity);
  return {
    ...result,
    reconcile: result.accepted ? "recovered" : "noop_aligned",
  };
}

/** @internal tests — ensure normalize export used for room key consistency */
export function normalizeExitedRoomIdForTests(roomId: string): string {
  return normalizeMessengerRealtimeRoomId(roomId);
}
