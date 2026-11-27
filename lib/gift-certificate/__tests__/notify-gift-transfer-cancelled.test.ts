import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(
    async () =>
      new Map([
        ["sender", "Sender Name"],
        ["handle-only", "@abc123"],
      ])
  ),
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

import { notifyGiftTransferCancelled, notifyGiftTransferOffered } from "@/lib/gift-certificate/notify-gift-transfer";
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
        title: "Gift certificate cancelled",
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

describe("언어 사후 검토 E4① — 대체 이름은 varKeys + peerFallback", () => {
  beforeEach(() => {
    vi.mocked(appendUserNotification).mockClear();
  });

  function lastMeta(): Record<string, unknown> {
    const call = vi.mocked(appendUserNotification).mock.calls.at(-1) as unknown[];
    return (call[1] as { meta: Record<string, unknown> }).meta;
  }

  it("실제 닉네임은 vars 에 그대로", async () => {
    await notifyGiftTransferCancelled({} as never, {
      senderUserId: "sender",
      recipientUserId: "recipient",
      transferId: "t-1",
      roomId: "room-1",
      instanceId: "i-1",
    });
    expect(lastMeta().vars).toEqual({ name: "Sender Name" });
    expect(lastMeta().peerFallback).toBeUndefined();
  });

  it("닉네임이 없으면 「상대」 키, vars 없음", async () => {
    await notifyGiftTransferCancelled({} as never, {
      senderUserId: "no-nick",
      recipientUserId: "recipient",
      transferId: "t-2",
      roomId: "room-1",
      instanceId: "i-1",
    });
    expect(lastMeta().varKeys).toEqual({ name: "notify_peer_fallback" });
    expect(lastMeta().peerFallback).toBe(true);
    expect(lastMeta().vars).toBeUndefined();
  });

  it("받기 요청에서 아이디(@…)만 있으면 「회원」 키", async () => {
    await notifyGiftTransferOffered({} as never, {
      recipientUserId: "recipient",
      senderUserId: "handle-only",
      transferId: "t-3",
      roomId: "room-1",
      instanceId: "i-1",
    });
    expect(lastMeta().varKeys).toEqual({ name: "notify_member_fallback_name" });
    expect(lastMeta().peerFallback).toBe(true);
    expect(lastMeta().vars).toBeUndefined();
  });
});
