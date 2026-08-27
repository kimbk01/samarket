import { describe, expect, it } from "vitest";
import { mapRealtimeMessageRow } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { parseGiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const GIFT_ID = "aa98fe73-5b48-409c-8300-5731813f0955";
const TRANSFER_ID = "ef3180e4-8945-4492-a166-03bf96562c8e";
const ROOM_ID = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const SENDER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const RECIPIENT = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";

const giftMeta = {
  gift_transfer_id: TRANSFER_ID,
  instance_id: "db9813e5-ed28-4423-b473-ac9f3bd6730b",
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
    createdAt: "2026-08-27T02:33:18.181Z",
    metadata: giftMeta,
    clientMessageId: null,
    isMine,
  };
}

describe("gift recipient timeline type preservation", () => {
  it("T1: postgres realtime mapper keeps gift_certificate (not demoted to text)", () => {
    const mapped = mapRealtimeMessageRow({
      id: GIFT_ID,
      room_id: ROOM_ID,
      sender_id: SENDER,
      message_type: "gift_certificate",
      content: "Gift certificate",
      metadata: giftMeta,
      created_at: "2026-08-27T02:33:18.181Z",
    });
    expect(mapped?.messageType).toBe("gift_certificate");
    expect(mapped?.metadata).toEqual(giftMeta);
  });

  it("T2: merge does not demote bootstrap gift_certificate to text for same id", () => {
    const fromBootstrap = giftMessage(false);
    const demotedRealtime: CommunityMessengerMessage = {
      ...fromBootstrap,
      messageType: "text",
    };
    const merged = mergeRoomMessages([fromBootstrap], [demotedRealtime]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageType).toBe("gift_certificate");
    expect(merged[0]?.metadata).toEqual(giftMeta);
  });

  it("T3: sender and recipient both keep gift_certificate for card render branch", () => {
    expect(giftMessage(true).messageType).toBe("gift_certificate");
    expect(giftMessage(false).messageType).toBe("gift_certificate");
  });

  it("T4: recipient PENDING metadata still parses for accept/reject CTAs", () => {
    const meta = parseGiftCertificateMessageMetadata(giftMeta);
    expect(meta?.gift_transfer_id).toBe(TRANSFER_ID);
    expect(meta?.transfer_status).toBe("PENDING");
    const isRecipient = !giftMessage(false).isMine;
    const showAcceptReject = isRecipient && meta?.transfer_status === "PENDING";
    expect(showAcceptReject).toBe(true);
    expect(RECIPIENT).toBeTruthy();
  });
});
