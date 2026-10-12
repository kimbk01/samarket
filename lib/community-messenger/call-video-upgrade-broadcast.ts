"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import {
  communityMessengerCallInviteChannelName,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { sendMessengerPrivateBroadcastFromClient } from "@/lib/community-messenger/realtime/private-broadcast-client";

export const CM_VIDEO_UPGRADE_REQUEST = "cm_video_upgrade_request";
export const CM_VIDEO_UPGRADE_RESPONSE = "cm_video_upgrade_response";

export type VideoUpgradeBroadcastPayload = {
  sessionId: string;
  fromUserId: string;
  accepted?: boolean;
};

/** 상대 비공개 토픽으로 REST broadcast(INSERT 정책) — 상대 토픽 join 없음 → 타임아웃 시 채널 잔류 문제 제거 */
async function publishToUser(
  recipientUserId: string,
  event: string,
  payload: VideoUpgradeBroadcastPayload
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("supabase_unavailable");
  const res = await sendMessengerPrivateBroadcastFromClient({
    sb,
    topic: communityMessengerCallInviteChannelName(recipientUserId),
    event,
    payload: payload as unknown as Record<string, unknown>,
    scope: `video_upgrade:${event}`,
    timeoutMs: 3_000,
  });
  if (!res.ok) throw new Error(`upgrade_broadcast_${res.status || res.error}`);
}

export async function publishVideoUpgradeRequest(
  recipientUserId: string,
  payload: VideoUpgradeBroadcastPayload
): Promise<boolean> {
  try {
    await publishToUser(recipientUserId, CM_VIDEO_UPGRADE_REQUEST, payload);
    return true;
  } catch {
    return false;
  }
}

export async function publishVideoUpgradeResponse(
  recipientUserId: string,
  payload: VideoUpgradeBroadcastPayload & { accepted: boolean }
): Promise<boolean> {
  try {
    await publishToUser(recipientUserId, CM_VIDEO_UPGRADE_RESPONSE, payload);
    return true;
  } catch {
    return false;
  }
}

export function subscribeVideoUpgradeBroadcast(
  userId: string,
  onEvent: (event: string, payload: VideoUpgradeBroadcastPayload) => void
): () => void {
  const sb = getSupabaseClient();
  if (!sb || !userId.trim()) return () => {};
  /** 본인 `cm-call-invite:<uid>` 공유 허브 — 직접 removeChannel 하면 전역 수신 벨 구독까지 닫힌다 */
  return subscribeCommunityMessengerCallInviteBroadcast(sb, userId, {
    onOtherEvent: (event, raw) => {
      if (event !== CM_VIDEO_UPGRADE_REQUEST && event !== CM_VIDEO_UPGRADE_RESPONSE) return;
      const p = raw as unknown as VideoUpgradeBroadcastPayload;
      if (p?.sessionId) onEvent(event, p);
    },
  });
}
