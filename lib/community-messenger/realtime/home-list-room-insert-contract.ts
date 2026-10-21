/**
 * Pure contract for cross-device home list INSERT broadcast (group create/invite).
 * Browser-safe and server-safe — no runtime Supabase / service / Node imports.
 */
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export const CM_HOME_LIST_ROOM_INSERT_EVENT = "cm_home_list_insert_room";

/**
 * F-14 — 친구 숨김/해제 등 **내 social graph 변경**을 내 다른 기기에 알리는 서버 전용 이벤트 (같은 `cm-home-list:<uid>` 비공개 토픽).
 * `user_relationships` 는 RLS 정책 0개라 postgres_changes 가 클라이언트에 오지 않는다 → 서버가 사용자 단위로 발행.
 * 클라이언트는 수신만 하고(`cm.home.social_sync` 로컬 버스) 절대 발행하지 않는다.
 */
export const CM_HOME_LIST_SOCIAL_GRAPH_CHANGED_EVENT = "cm_home_list_social_graph_changed";

export type CmHomeListSocialGraphChangedReason = "friend_hidden" | "friend_unhidden";

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
