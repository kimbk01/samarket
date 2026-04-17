"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  requestMessengerHubBadgeResync,
  type MessengerHubBadgeResyncReason,
} from "@/lib/community-messenger/notifications/messenger-notification-contract";

/**
 * 메신저 홈 `chats`/`groups`에 아직 없는 방(거래 진입·첫 발신 등)을 `home-summary` 한 번으로 가져와
 * 모든 탭의 부트스트랩 리스트에 병합한다.
 */
export async function requestMessengerHomeListMergeFromHomeSummary(
  cmRoomId: string,
  badgeResyncReason: MessengerHubBadgeResyncReason
): Promise<void> {
  const id = String(cmRoomId ?? "").trim();
  const uid = getCurrentUser()?.id?.trim();
  if (!id || !uid) return;
  const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(id)}/home-summary`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; room?: CommunityMessengerRoomSummary };
  if (!res.ok || !json.ok || !json.room) return;
  postCommunityMessengerBusEvent({
    type: "cm.home.merge_room_summary",
    viewerUserId: uid,
    summary: json.room,
    at: Date.now(),
  });
  requestMessengerHubBadgeResync(badgeResyncReason);
}
