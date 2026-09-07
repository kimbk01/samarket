import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const CUT4_MIG = "supabase/migrations/20261209120000_gift_offer_room_peer_bind.sql";
const OFFER_ROUTE = "app/api/me/gift-certificates/transfers/offer/route.ts";

describe("CUT4 gift_certificate_offer room-peer bind", () => {
  it("RPC validates GENERAL direct + sender participant + exact peer before gift mutation", () => {
    const mig = source(CUT4_MIG);
    const roomGate = mig.indexOf("not_general_direct");
    const participantGate = mig.indexOf("not_room_participant");
    const peerGate = mig.indexOf("not_room_peer");
    const invalidDirect = mig.indexOf("invalid_direct_room");
    const lockUpdate = mig.indexOf("SET status = 'GIFT_LOCKED'");
    const transferInsert = mig.indexOf("INSERT INTO public.gift_certificate_transfers");
    const messageInsert = mig.indexOf("INSERT INTO public.community_messenger_messages");

    expect(roomGate).toBeGreaterThan(-1);
    expect(participantGate).toBeGreaterThan(-1);
    expect(peerGate).toBeGreaterThan(-1);
    expect(invalidDirect).toBeGreaterThan(-1);
    expect(lockUpdate).toBeGreaterThan(-1);
    expect(transferInsert).toBeGreaterThan(-1);
    expect(messageInsert).toBeGreaterThan(-1);

    // Room-peer gates must precede asset mutation.
    expect(roomGate).toBeLessThan(lockUpdate);
    expect(participantGate).toBeLessThan(lockUpdate);
    expect(peerGate).toBeLessThan(lockUpdate);
    expect(peerGate).toBeLessThan(transferInsert);
    expect(peerGate).toBeLessThan(messageInsert);

    expect(mig).toContain("community_messenger_participants");
    expect(mig).toContain("left_at IS NULL");
    expect(mig).toContain("v_validated_room_id");
    expect(mig).toContain("v_validated_peer_user_id");
    expect(mig).toContain("chat_domain");
    expect(mig).toContain("'general_direct'");
    // Peer bind must not use display/direct_key parsing as security authority.
    expect(mig).not.toContain("direct_key");
    expect(mig).not.toContain("nickname");
  });

  it("S2 A-B room → C friend rejects with not_room_peer; no mutation path after peer fail", () => {
    const mig = source(CUT4_MIG);
    expect(mig).toContain("p_recipient_user_id IS DISTINCT FROM v_validated_peer_user_id");
    expect(mig).toContain("'not_room_peer'");
    const peerReject = mig.indexOf("'not_room_peer'");
    const transferInsert = mig.indexOf("INSERT INTO public.gift_certificate_transfers");
    expect(peerReject).toBeLessThan(transferInsert);
  });

  it("S3 sender not participant rejects before gift lock", () => {
    const mig = source(CUT4_MIG);
    expect(mig).toContain("'not_room_participant'");
    const partReject = mig.indexOf("'not_room_participant'");
    const lockUpdate = mig.indexOf("SET status = 'GIFT_LOCKED'");
    expect(partReject).toBeLessThan(lockUpdate);
  });

  it("preserves existing gift gates and atomic message projection", () => {
    const mig = source(CUT4_MIG);
    expect(mig).toContain("'cannot_gift_self'");
    expect(mig).toContain("'not_friend'");
    expect(mig).toContain("'blocked'");
    expect(mig).toContain("'not_owner'");
    expect(mig).toContain("'not_transferable'");
    expect(mig).toContain("'PENDING'");
    expect(mig).toContain("GIFT_LOCKED");
    expect(mig).toContain("gift_transfer_build_mutation_response");
    expect(mig).toContain("community_messenger_apply_unread_for_text_message");
    expect(mig).toContain("SECURITY DEFINER");
    expect(mig).toContain("SET search_path = public");
  });

  it("does not add duplicate API room-peer gate in this CUT", () => {
    const route = source(OFFER_ROUTE);
    expect(route).not.toContain("not_room_peer");
    expect(route).not.toContain("not_room_participant");
    expect(route).not.toContain("community_messenger_participants");
    expect(route).toContain("executeGiftTransferOffer");
    expect(route).toContain("not_general_direct");
  });

  it("signature and callers unchanged", () => {
    const mig = source(CUT4_MIG);
    const rpc = source("lib/gift-certificate/gift-certificate-rpc.ts");
    expect(mig).toContain(
      "CREATE OR REPLACE FUNCTION public.gift_certificate_offer(\n  p_sender_user_id uuid,\n  p_instance_id uuid,\n  p_recipient_user_id uuid,\n  p_room_id uuid,\n  p_idempotency_key text\n)"
    );
    expect(rpc).toContain("GIFT_RPCS.offer");
    expect(rpc).toContain("p_sender_user_id");
    expect(rpc).toContain("p_recipient_user_id");
    expect(rpc).toContain("p_room_id");
  });
});
