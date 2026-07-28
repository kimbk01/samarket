/**
 * CM participants / home INSERT 인앱음 — NotificationDomain 분기.
 * room title·participant count·URL 추측 금지. `chatDomain` / canonical resolver 만 사용.
 */

import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { resolveMessengerRoomChatDomain } from "@/lib/community-messenger/unread/messenger-room-unread-authority";

/**
 * @returns 재생할 NotificationDomain. 도메인 미상·commerce(CM 탭 밖)는 null → 재생 생략.
 */
export function resolveCmInAppSoundNotificationDomain(
  roomId: string,
  viewerUserId: string | null | undefined
): NotificationDomain | null {
  const rid = String(roomId ?? "").trim();
  if (!rid) return null;
  const chatDomain = resolveMessengerRoomChatDomain(rid, String(viewerUserId ?? "").trim());
  if (chatDomain === "group") return "community_group_chat";
  if (chatDomain === "general_direct") return "community_direct_chat";
  /** trade / store_order / unknown — CM community tone 으로 위장하지 않음 */
  return null;
}
