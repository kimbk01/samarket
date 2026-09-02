import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  __resetGiftTransferUiStatusForTests,
  rememberGiftTransferUiStatus,
  resolveGiftTransferUiStatus,
} from "@/lib/gift-certificate/gift-transfer-ui-status";
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
    const msg = giftMessage("PENDING");
    expect(msg.metadata?.transfer_status).toBe("PENDING");
  });

  it("T2: accept route projects messenger status after RPC", () => {
    const acceptRoute = source("app/api/me/gift-certificates/transfers/[transferId]/accept/route.ts");
    expect(acceptRoute).toContain("giftCertificateAccept(sb");
    expect(acceptRoute).toContain("projectGiftTransferMessengerStatus(sb");
    expect(acceptRoute).toContain('transferStatus: "ACCEPTED"');
  });

  it("T3: accept projection updates metadata.transfer_status to ACCEPTED", () => {
    const projection = source("lib/gift-certificate/project-gift-transfer-messenger-status.ts");
    expect(projection).toContain("transfer_status: args.transferStatus");
    expect(projection).toContain("community_messenger_messages");
    expect(projection).toContain("publishMessengerRoomBumpAfterMutation");
    expect(projection).toContain("actorUserId");
  });

  it("T4: same messageId UPDATE merge replaces status on one card", () => {
    const pending = giftMessage("PENDING");
    const updated: CommunityMessengerMessage = {
      ...pending,
      metadata: {
        ...(pending.metadata as Record<string, unknown>),
        transfer_status: "ACCEPTED",
      },
    };
    const merged = mergeRoomMessages([pending], [updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(MESSAGE_ID);
    expect(merged[0]?.metadata?.transfer_status).toBe("ACCEPTED");
  });

  it("T5: sender card display follows metadata.transfer_status (not stale local state)", () => {
    const card = source("components/community-messenger/MessengerGiftCertificateCard.tsx");
    expect(card).toContain("resolveGiftTransferUiStatus(meta.gift_transfer_id, meta.transfer_status)");
    expect(card).not.toMatch(/resolveGiftTransferUiStatus\(meta\.gift_transfer_id,\s*status\)/);
  });

  it("T6: recipient remembered ACCEPTED survives stale metadata", () => {
    __resetGiftTransferUiStatusForTests();
    rememberGiftTransferUiStatus(TRANSFER_ID, "ACCEPTED");
    expect(resolveGiftTransferUiStatus(TRANSFER_ID, "PENDING")).toBe("ACCEPTED");
  });

  it("T7: duplicate card stays one after status UPDATE merge", () => {
    const pending = giftMessage("PENDING");
    const accepted = giftMessage("ACCEPTED");
    const merged = mergeRoomMessages([pending], [accepted]);
    expect(merged.filter((m) => m.id === MESSAGE_ID)).toHaveLength(1);
  });

  it("T8: accept failure path keeps PENDING metadata projection contract", () => {
    const acceptRoute = source("app/api/me/gift-certificates/transfers/[transferId]/accept/route.ts");
    const failIdx = acceptRoute.indexOf("if (!result.ok)");
    const projectIdx = acceptRoute.indexOf("await projectGiftTransferMessengerStatus");
    expect(failIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeGreaterThan(failIdx);
  });
});
