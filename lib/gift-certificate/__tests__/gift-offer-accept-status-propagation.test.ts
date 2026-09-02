import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { parseGiftTransferMutationResponse } from "@/lib/gift-certificate/gift-transfer-mutation-response";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const TRANSFER_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const SENDER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

function giftMessage(transferStatus: "PENDING" | "ACCEPTED"): CommunityMessengerMessage {
  return {
    id: MESSAGE_ID,
    roomId: ROOM_ID,
    senderId: SENDER,
    senderLabel: "Sender",
    messageType: "gift_certificate",
    content: "Gift certificate",
    createdAt: "2026-09-02T03:00:00.000Z",
    metadata: {
      gift_transfer_id: TRANSFER_ID,
      transfer_status: transferStatus,
      face_value: 1000,
      remaining_balance: 1000,
    },
    clientMessageId: null,
    isMine: true,
  };
}

describe("gift offer accept status propagation", () => {
  it("T1: offer message starts PENDING", () => {
    expect(giftMessage("PENDING").metadata?.transfer_status).toBe("PENDING");
  });

  it("T2: accept route runs transactional transition owner", () => {
    const acceptRoute = source("app/api/me/gift-certificates/transfers/[transferId]/accept/route.ts");
    expect(acceptRoute).toContain("executeGiftTransferTransition");
    expect(acceptRoute).toContain('kind: "accept"');
    expect(acceptRoute).not.toContain("projectGiftTransferMessengerStatus");
  });

  it("T3: accept mutation returns ACCEPTED projection on same message", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer: {
        id: TRANSFER_ID,
        status: "ACCEPTED",
        instance_id: "44444444-4444-4444-8444-444444444444",
        room_id: ROOM_ID,
        messenger_message_id: MESSAGE_ID,
      },
      message: {
        id: MESSAGE_ID,
        room_id: ROOM_ID,
        sender_id: SENDER,
        message_type: "gift_certificate",
        content: "Gift certificate",
        created_at: "2026-09-02T03:00:00.000Z",
        metadata: { gift_transfer_id: TRANSFER_ID, transfer_status: "ACCEPTED" },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.transfer.status).toBe("ACCEPTED");
      expect(parsed.message.id).toBe(MESSAGE_ID);
      expect(parsed.message.metadata?.transfer_status).toBe("ACCEPTED");
    }
  });

  it("T4: same messageId UPDATE merge replaces status on one card", () => {
    const merged = mergeRoomMessages([giftMessage("PENDING")], [giftMessage("ACCEPTED")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.metadata?.transfer_status).toBe("ACCEPTED");
  });

  it("T5: sender card display follows metadata.transfer_status", () => {
    const card = source("components/community-messenger/MessengerGiftCertificateCard.tsx");
    expect(card).toContain("meta.transfer_status ?? \"PENDING\"");
    expect(card).not.toContain("rememberGiftTransferUiStatus");
  });

  it("T6: recipient merges API message after accept", () => {
    const card = source("components/community-messenger/MessengerGiftCertificateCard.tsx");
    expect(card).toContain("onMessageMerge?.(parsed.message)");
  });

  it("T7: duplicate card stays one after status UPDATE merge", () => {
    const merged = mergeRoomMessages([giftMessage("PENDING")], [giftMessage("ACCEPTED")]);
    expect(merged.filter((m) => m.id === MESSAGE_ID)).toHaveLength(1);
  });

  it("T8: accept failure path does not project before RPC ok", () => {
    const transition = source("lib/gift-certificate/execute-gift-transfer-transition.ts");
    const rpcCallIdx = transition.indexOf("await giftCertificateAccept");
    const failIdx = transition.indexOf("if (!rpc.ok)");
    const parseIdx = transition.lastIndexOf("parseGiftTransferMutationResponse");
    expect(rpcCallIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeGreaterThan(rpcCallIdx);
    expect(parseIdx).toBeGreaterThan(failIdx);
  });
});
