import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  parseGiftTransferMutationResponse,
  type GiftTransferMutationResponse,
} from "@/lib/gift-certificate/gift-transfer-mutation-response";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const TRANSFER_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const INSTANCE_ID = "44444444-4444-4444-8444-444444444444";
const SENDER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

function nestedOk(status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED"): Record<string, unknown> {
  return {
    ok: true,
    transfer: {
      id: TRANSFER_ID,
      status,
      instance_id: INSTANCE_ID,
      room_id: ROOM_ID,
      messenger_message_id: MESSAGE_ID,
      sender_user_id: SENDER,
      recipient_user_id: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
    },
    message: {
      id: MESSAGE_ID,
      room_id: ROOM_ID,
      sender_id: SENDER,
      message_type: "gift_certificate",
      content: "Gift certificate",
      created_at: "2026-09-02T08:00:00.000Z",
      metadata: {
        gift_transfer_id: TRANSFER_ID,
        transfer_status: status,
        public_gift_number: "GFT-TEST-00001",
      },
    },
  };
}

function giftMessage(status: "PENDING" | "ACCEPTED"): CommunityMessengerMessage {
  return {
    id: MESSAGE_ID,
    roomId: ROOM_ID,
    senderId: SENDER,
    senderLabel: "Sender",
    messageType: "gift_certificate",
    content: "Gift certificate",
    createdAt: "2026-09-02T08:00:00.000Z",
    metadata: {
      gift_transfer_id: TRANSFER_ID,
      transfer_status: status,
    },
    clientMessageId: null,
    isMine: true,
  };
}

describe("gift transfer messenger SSOT", () => {
  it("T1/T2: nested mutation response exposes transfer.id + message.id", () => {
    const parsed = parseGiftTransferMutationResponse(nestedOk("PENDING"), {
      viewerUserId: SENDER,
    }) as GiftTransferMutationResponse;
    expect(parsed.ok).toBe(true);
    expect(parsed.transfer.id).toBe(TRANSFER_ID);
    expect(parsed.transfer.status).toBe("PENDING");
    expect(parsed.message.id).toBe(MESSAGE_ID);
    expect(parsed.message.metadata?.transfer_status).toBe("PENDING");
  });

  it("T3: flat transfer_id / message_id alone is rejected (no parallel parser)", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer_id: TRANSFER_ID,
      message_id: MESSAGE_ID,
    });
    expect(parsed.ok).toBe(false);
  });

  it("T6/T9/T10: migration projects ACCEPTED/REJECTED/CANCELLED in-TX", () => {
    const mig = source("supabase/migrations/20261202180000_gift_transfer_messenger_ssot.sql");
    expect(mig).toContain("gift_transfer_project_message_status_in_tx(v_tr.id, 'ACCEPTED')");
    expect(mig).toContain("gift_transfer_project_message_status_in_tx(v_tr.id, 'REJECTED')");
    expect(mig).toContain("gift_transfer_project_message_status_in_tx(v_tr.id, 'CANCELLED')");
    expect(mig).toContain("gift_transfer_build_mutation_response");
  });

  it("T7/T8/T12: same messageId merge replaces status without duplicate", () => {
    const pending = giftMessage("PENDING");
    const accepted = giftMessage("ACCEPTED");
    const merged = mergeRoomMessages([pending], [accepted]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(MESSAGE_ID);
    expect(merged[0]?.metadata?.transfer_status).toBe("ACCEPTED");
  });

  it("T12b: terminal status does not downgrade to PENDING on stale merge", () => {
    const accepted = giftMessage("ACCEPTED");
    const stale = giftMessage("PENDING");
    const merged = mergeRoomMessages([accepted], [stale]);
    expect(merged[0]?.metadata?.transfer_status).toBe("ACCEPTED");
  });

  it("T13/T14: offer/accept/reject/cancel routes + QA use nested transfer/message", () => {
    const offer = source("app/api/me/gift-certificates/transfers/offer/route.ts");
    const accept = source("app/api/me/gift-certificates/transfers/[transferId]/accept/route.ts");
    const reject = source("app/api/me/gift-certificates/transfers/[transferId]/reject/route.ts");
    const cancel = source("app/api/me/gift-certificates/transfers/[transferId]/cancel/route.ts");
    const qa = source("scripts/qa/gift-offer-instant-delivery-runtime-close.mjs");
    const card = source("components/community-messenger/MessengerGiftCertificateCard.tsx");
    for (const src of [offer, accept, reject, cancel]) {
      expect(src).toContain("transfer: result.transfer");
      expect(src).toContain("message: result.message");
      expect(src).not.toContain("transfer_id: result");
    }
    expect(accept).toContain("executeGiftTransferTransition");
    expect(accept).not.toContain("projectGiftTransferMessengerStatus");
    expect(qa).toContain("offerJson?.transfer?.id");
    expect(qa).toContain("offerJson?.message?.id");
    expect(card).toContain("parseGiftTransferMutationResponse");
    expect(card).toContain("onMessageMerge");
    expect(card).not.toContain("rememberGiftTransferUiStatus");
  });

  it("T15: gift number visual stacked row preserved", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    expect(face).toContain('data-gift-cert-number-row="stacked"');
    expect(face).toContain('data-gift-public-number="1"');
  });
});
