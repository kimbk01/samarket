import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { serializeCommunityMessengerMessageForBump } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";

/** 메시지·미디어 변경 후 부트스트랩 캐시 무효화 + 원장 방 기준 Broadcast bump(거래 URL id 와 CM uuid 가 다를 때 둘 다 무효화). */
export async function publishMessengerRoomBumpAfterMutation(args: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  /** 있으면 bump 페이로드에 실어 수신 측이 HTTP 전에 목록에 반영 가능 */
  messageForBump?: CommunityMessengerMessage | null;
}): Promise<void> {
  const raw = args.rawRouteRoomId.trim();
  const canon = args.canonicalRoomId.trim();
  if (!canon || !args.fromUserId.trim()) return;
  invalidateRoomBootstrapRouteCacheForRoom(canon);
  if (raw && raw !== canon) {
    invalidateRoomBootstrapRouteCacheForRoom(raw);
  }
  const fromUserId = args.fromUserId.trim();
  const rawTagged = raw && raw.toLowerCase() !== canon.toLowerCase() ? raw : "";
  const messageSnapshot =
    args.messageForBump != null ? serializeCommunityMessengerMessageForBump(args.messageForBump) : null;

  await publishCommunityMessengerRoomBumpFromServer({
    channelRoomId: canon,
    canonicalRoomId: canon,
    fromUserId,
    messageId: args.messageId,
    messageCreatedAt: args.messageCreatedAt,
    rawRouteRoomId: rawTagged || null,
    messageSnapshot,
  });
  if (rawTagged) {
    await publishCommunityMessengerRoomBumpFromServer({
      channelRoomId: raw,
      canonicalRoomId: canon,
      fromUserId,
      messageId: args.messageId,
      messageCreatedAt: args.messageCreatedAt,
      rawRouteRoomId: rawTagged,
      messageSnapshot,
    });
  }
}
