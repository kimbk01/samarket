import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { parseGiftTransferMutationResponse } from "@/lib/gift-certificate/gift-transfer-mutation-response";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift offer instant delivery contract", () => {
  it("T1 atomic migration requires room_id and inserts messenger message in offer RPC", () => {
    const mig = source("supabase/migrations/20261202150000_gift_certificate_offer_messenger_atomic.sql");
    expect(mig).toContain("room_id_required");
    expect(mig).toContain("INSERT INTO public.community_messenger_messages");
    expect(mig).toContain("messenger_message_id = v_message_id");
    expect(mig).toContain("'transfer_status', 'PENDING'");
  });

  it("T2 offer route requires roomId and returns canonical nested transfer+message", () => {
    const route = source("app/api/me/gift-certificates/transfers/offer/route.ts");
    const exec = source("lib/gift-certificate/execute-gift-transfer-offer.ts");
    expect(route).toContain('error: "roomId_required"');
    expect(route).toContain("executeGiftTransferOffer");
    expect(route).toContain("message: result.message");
    expect(route).toContain("transfer: result.transfer");
    expect(exec).toContain("message_projection_missing");
    expect(exec).toContain("parseGiftTransferMutationResponse");
  });

  it("T3 nested response without message is API failure (no silent ok:true)", () => {
    const parsed = parseGiftTransferMutationResponse({ ok: true, transfer: { id: "t1", status: "PENDING" } });
    expect(parsed.ok).toBe(false);
  });

  it("T5 API success payload includes real messageId for timeline merge", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "PENDING",
        instance_id: "44444444-4444-4444-8444-444444444444",
        room_id: "33333333-3333-4333-8333-333333333333",
        messenger_message_id: "22222222-2222-4222-8222-222222222222",
      },
      message: {
        id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        sender_id: "sender",
        message_type: "gift_certificate",
        content: "Gift certificate",
        created_at: "2026-09-02T02:00:00.000Z",
        metadata: {
          gift_transfer_id: "11111111-1111-4111-8111-111111111111",
          transfer_status: "PENDING",
        },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.id).toBe("22222222-2222-4222-8222-222222222222");
      expect(parsed.message.messageType).toBe("gift_certificate");
    }
  });

  it("T7 realtime echo dedupes by messageId (no duplicate cards)", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "PENDING",
        instance_id: "44444444-4444-4444-8444-444444444444",
        room_id: "33333333-3333-4333-8333-333333333333",
        messenger_message_id: "22222222-2222-4222-8222-222222222222",
      },
      message: {
        id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        sender_id: "sender",
        message_type: "gift_certificate",
        content: "Gift certificate",
        created_at: "2026-09-02T02:00:00.000Z",
        metadata: {
          gift_transfer_id: "11111111-1111-4111-8111-111111111111",
          transfer_status: "PENDING",
        },
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const canonical = { ...parsed.message, senderLabel: "Me", isMine: true };
    const echo = { ...canonical, senderLabel: "Peer echo" };
    const merged = mergeRoomMessages([canonical], [echo]);
    expect(merged.filter((m) => m.id === canonical.id)).toHaveLength(1);
  });

  it("T10 initial card stays PENDING — not auto ACCEPTED", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "PENDING",
        instance_id: "44444444-4444-4444-8444-444444444444",
        room_id: "33333333-3333-4333-8333-333333333333",
        messenger_message_id: "22222222-2222-4222-8222-222222222222",
      },
      message: {
        id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        sender_id: "sender",
        message_type: "gift_certificate",
        content: "Gift certificate",
        created_at: "2026-09-02T02:00:00.000Z",
        metadata: {
          gift_transfer_id: "11111111-1111-4111-8111-111111111111",
          transfer_status: "PENDING",
        },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.metadata?.transfer_status).toBe("PENDING");
    }
  });

  it("T6 sender merge uses canonical server message — no gift refresh race", () => {
    const sheets = source(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    const controller = source(
      "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"
    );
    expect(sheets).toContain("mergeCanonicalRoomMessage");
    expect(sheets).not.toContain("setTimeout");
    expect(controller).toContain("mergeCanonicalRoomMessage");
  });

  it("T8 receiver uses existing postgres realtime SSOT for gift_certificate", () => {
    const channel = source(
      "lib/community-messenger/realtime/community-messenger-room-message-realtime-channel.ts"
    );
    const ingest = source("lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts");
    expect(channel).toContain('"gift_certificate"');
    expect(ingest).toContain("mergeRoomMessages");
  });
});

describe("gift certificate number row visual SSOT", () => {
  const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");

  it("T13-T18 stacked number row — full display, no ellipsis, no overlap layout", () => {
    expect(face).toContain("NumberMetaRow");
    expect(face).toContain("numberLabelY");
    expect(face).toContain("numberValueY");
    expect(face).toContain('data-gift-cert-number-row="stacked"');
    expect(face).toContain('data-gift-public-number="1"');
    expect(face).not.toMatch(/value\.length > 17/);
  });
});
