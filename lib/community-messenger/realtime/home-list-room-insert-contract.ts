/**
 * Pure contract for cross-device home list INSERT broadcast (group create/invite).
 * Browser-safe and server-safe — no runtime Supabase / service / Node imports.
 */
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export const CM_HOME_LIST_ROOM_INSERT_EVENT = "cm_home_list_insert_room";

export function communityMessengerHomeListChannelName(userId: string): string {
  return `cm-home-list:${String(userId ?? "").trim().toLowerCase()}`;
}

/** Minimal shape check — summary must already be server-built. */
export function isCanonicalHomeListRoomSummaryPayload(
  raw: unknown
): raw is CommunityMessengerRoomSummary {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const roomType = typeof row.roomType === "string" ? row.roomType.trim() : "";
  const title = typeof row.title === "string" ? row.title : "";
  if (!id || !roomType) return false;
  if (typeof title !== "string") return false;
  if (!("lastMessageAt" in row)) return false;
  return true;
}
