import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["sender", "Sender Name"]])),
}));

vi.mock("@/lib/community-messenger/social-relations", () => ({
  getBlockedRelation: vi.fn(async () => ({
    blockedByMe: false,
    blockedByPeer: false,
    blockedEitherWay: false,
  })),
}));

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "en"),
}));

import { notifyGiftTransferCancelled } from "@/lib/gift-certificate/notify-gift-transfer";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

describe("notifyGiftTransferCancelled", () => {
  beforeEach(() => {
    vi.mocked(appendUserNotification).mockClear();
  });

  it("writes recipient cancel notification with stable dedupe key", async () => {
    await notifyGiftTransferCancelled({} as never, {
      senderUserId: "sender",
      recipientUserId: "recipient",
      transferId: "transfer-1",
      roomId: "room-1",
      instanceId: "instance-1",
    });

    expect(appendUserNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        user_id: "recipient",
        notification_type: "chat",
        title: "Gift cancelled",
        body: "Sender Name cancelled the gift certificate.",
        link_url: "/community-messenger/rooms/room-1?giftTransferId=transfer-1",
        domain: "community_chat",
        ref_id: "transfer-1",
        dedupe_key: "gift_transfer_cancelled:transfer-1",
        push_kind: "community",
        meta: expect.objectContaining({
          kind: "gift_transfer_cancelled",
          gift_transfer_id: "transfer-1",
          room_id: "room-1",
          instance_id: "instance-1",
          sender_user_id: "sender",
        }),
      })
    );
  });
});
