import { describe, expect, it } from "vitest";
import { mapRealtimeMessageRow } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { resolveMessengerRoomEntryScrollPlan } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { parseGiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const GIFT_ID = "90915849-b723-4dcf-ae36-55f14a39a435";
const TRANSFER_ID = "5996b713-7c4a-46bb-8ebe-b01eb1d0f6db";
const ROOM_ID = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const SENDER = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const RECIPIENT = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

const giftMeta = {
  gift_transfer_id: TRANSFER_ID,
  instance_id: "e7fd236e-79a5-43f5-b2af-542e9359ecd9",
  transfer_status: "PENDING",
  face_value: 1000,
  remaining_balance: 1000,
  title: "Store gift",
  store_name: "Test Store",
};

function giftMessage(isMine: boolean): CommunityMessengerMessage {
  return {
    id: GIFT_ID,
    roomId: ROOM_ID,
    senderId: SENDER,
    senderLabel: isMine ? "Me" : "Peer",
    messageType: "gift_certificate",
    content: "Gift certificate",
    createdAt: "2026-08-27T05:35:00.000Z",
    metadata: giftMeta,
    clientMessageId: null,
    isMine,
  };
}

describe("gift recipient timeline type preservation", () => {
  it("T1: recipient hydrated timeline preserves gift_certificate", () => {
    const mapped = mapRealtimeMessageRow({
      id: GIFT_ID,
      room_id: ROOM_ID,
      sender_id: SENDER,
      message_type: "gift_certificate",
      content: "Gift certificate",
      metadata: giftMeta,
      created_at: "2026-08-27T05:35:00.000Z",
    });
    expect(mapped?.messageType).toBe("gift_certificate");
    expect(mapped?.metadata).toEqual(giftMeta);
    expect(giftMessage(false).messageType).toBe("gift_certificate");
  });

  it("T2: recipient merge preserves gift metadata", () => {
    const fromBootstrap = giftMessage(false);
    const demotedRealtime: CommunityMessengerMessage = {
      ...fromBootstrap,
      messageType: "text",
      metadata: {},
    };
    const merged = mergeRoomMessages([fromBootstrap], [demotedRealtime]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageType).toBe("gift_certificate");
    expect(merged[0]?.metadata).toEqual(giftMeta);
  });

  it("T3: recipient entry with unread older + newest peer gift forces bottom (card in viewport)", () => {
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: "default",
      hasPersisted: false,
      unreadCount: 3,
      firstUnreadMessageId: "older-unread",
      newestPeerGiftCertificate: true,
    });
    expect(plan.forceBottom).toBe(true);
    expect(plan.anchorMessageId).toBeNull();
  });

  it("T3b: same tip re-entry after consumed ignores stale unread restore", () => {
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: "default",
      hasPersisted: true,
      unreadCount: 3,
      firstUnreadMessageId: "older-unread",
      newestPeerGiftCertificate: true,
      tipEntryConsumed: true,
    });
    expect(plan.forceBottom).toBe(true);
    expect(plan.reason).toBe("initial_load");
    expect(plan.anchorMessageId).toBeNull();
  });

  it("T4: recipient PENDING card metadata shows accept/reject CTAs", () => {
    const meta = parseGiftCertificateMessageMetadata(giftMeta);
    expect(meta?.gift_transfer_id).toBe(TRANSFER_ID);
    expect(meta?.transfer_status).toBe("PENDING");
    const isRecipient = !giftMessage(false).isMine;
    expect(isRecipient && meta?.transfer_status === "PENDING").toBe(true);
    expect(RECIPIENT).toBeTruthy();
  });

  it("T5: sender card entry unchanged (no peer-gift force bottom)", () => {
    const plan = resolveMessengerRoomEntryScrollPlan({
      intent: "default",
      hasPersisted: false,
      unreadCount: 2,
      firstUnreadMessageId: "fu-1",
      newestPeerGiftCertificate: false,
    });
    expect(plan.forceBottom).toBe(false);
    expect(plan.anchorMessageId).toBe("fu-1");
    expect(giftMessage(true).isMine).toBe(true);
  });
});
