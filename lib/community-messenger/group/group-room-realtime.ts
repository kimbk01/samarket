import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";

/** Group membership / settings mutation 후 홈 목록 bump — CM room bump SSOT 래퍼. */
export async function publishGroupRoomListBump(args: {
  roomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  /** Soft-delete: peers remove hub row without tip merge */
  listAction?: "remove";
  reason?: "group_deleted";
}): Promise<void> {
  const roomId = args.roomId.trim();
  const fromUserId = args.fromUserId.trim();
  if (!roomId || !fromUserId) return;
  await publishMessengerRoomBumpAfterMutation({
    rawRouteRoomId: roomId,
    canonicalRoomId: roomId,
    fromUserId,
    messageId: args.messageId,
    messageCreatedAt: args.messageCreatedAt,
    listAction: args.listAction,
    reason: args.reason,
    skipBadgeTargetBump: args.listAction === "remove",
  });
}
