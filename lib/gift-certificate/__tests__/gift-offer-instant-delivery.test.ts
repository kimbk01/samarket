import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGiftOfferCommunityMessengerMessage,
  parseGiftOfferRpcSuccess,
} from "@/lib/gift-certificate/gift-offer-canonical-message";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";

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

  it("T2 offer route requires roomId and returns canonical message on success", () => {
    const route = source("app/api/me/gift-certificates/transfers/offer/route.ts");
    const exec = source("lib/gift-certificate/execute-gift-transfer-offer.ts");
    expect(route).toContain('error: "roomId_required"');
    expect(route).toContain("executeGiftTransferOffer");
    expect(route).toContain("message: result.message");
    expect(exec).toContain("message_projection_missing");
    expect(exec).not.toMatch(/return NextResponse\.json\(\{ ok: true[^}]*\}\)[\s\S]*msgErr/);
  });

  it("T3 RPC success without messageId is API failure (no silent ok:true)", () => {
    const parsed = parseGiftOfferRpcSuccess({ ok: true, transfer_id: "t1" });
    expect(parsed).toBeNull();
  });

  it("T5 API success payload includes real messageId for timeline merge", () => {
    const offer = parseGiftOfferRpcSuccess({
      transfer_id: "11111111-1111-4111-8111-111111111111",
      message_id: "22222222-2222-4222-8222-222222222222",
      room_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-09-02T02:00:00.000Z",
      metadata: { gift_transfer_id: "11111111-1111-4111-8111-111111111111", transfer_status: "PENDING" },
    });
    expect(offer?.message_id).toBe("22222222-2222-4222-8222-222222222222");
    const msg = buildGiftOfferCommunityMessengerMessage({
      offer: offer!,
      senderUserId: "sender",
      senderLabel: "Me",
    });
    expect(msg.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(msg.messageType).toBe("gift_certificate");
    expect(msg.isMine).toBe(true);
  });

  it("T7 realtime echo dedupes by messageId (no duplicate cards)", () => {
    const canonical = buildGiftOfferCommunityMessengerMessage({
      offer: parseGiftOfferRpcSuccess({
        transfer_id: "11111111-1111-4111-8111-111111111111",
        message_id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-09-02T02:00:00.000Z",
        metadata: { gift_transfer_id: "11111111-1111-4111-8111-111111111111", transfer_status: "PENDING" },
      })!,
      senderUserId: "sender",
      senderLabel: "Me",
    });
    const echo = { ...canonical, senderLabel: "Peer echo" };
    const merged = mergeRoomMessages([canonical], [echo]);
    expect(merged.filter((m) => m.id === canonical.id)).toHaveLength(1);
  });

  it("T10 initial card stays PENDING — not auto ACCEPTED", () => {
    const msg = buildGiftOfferCommunityMessengerMessage({
      offer: parseGiftOfferRpcSuccess({
        transfer_id: "11111111-1111-4111-8111-111111111111",
        message_id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        metadata: { gift_transfer_id: "11111111-1111-4111-8111-111111111111", transfer_status: "PENDING" },
      })!,
      senderUserId: "sender",
      senderLabel: "Me",
    });
    const meta = msg.metadata as { transfer_status?: string };
    expect(meta.transfer_status).toBe("PENDING");
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
