import "server-only";

import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import {
  CM_PRESENCE_USER_BROADCAST_EVENT,
  communityMessengerPresenceUserChannelName,
  type CmPresenceUserBroadcastPayload,
} from "@/lib/community-messenger/realtime/presence/cm-presence-user-channel";

/**
 * D1 2단계 — 접속 상태 **전환**을 그 사용자의 비공개 토픽 1곳에만 발행한다(구독자 = 실시간으로 보고 있는 상대).
 * 주기 keepalive 는 발행하지 않는다(보는 쪽은 만료 시점에 스냅샷 1회로 확인).
 */
export async function publishCommunityMessengerPresenceTransitionFromServer(args: {
  userId: string;
  state: "online" | "offline";
  lastSeenAt: string | null;
}): Promise<void> {
  const userId = args.userId.trim();
  if (!userId) return;
  const payload: CmPresenceUserBroadcastPayload = {
    v: 1,
    userId,
    state: args.state,
    lastSeenAt: args.lastSeenAt,
    at: new Date().toISOString(),
  };
  await publishMessengerPrivateBroadcastFromServer({
    scope: "presence_user",
    messages: [
      {
        topic: communityMessengerPresenceUserChannelName(userId),
        event: CM_PRESENCE_USER_BROADCAST_EVENT,
        payload: { ...payload },
      },
    ],
  });
}
