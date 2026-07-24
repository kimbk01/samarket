import { describe, expect, it } from "vitest";
import {
  domainEnvelopeToPushMeta,
  isCanonicalDomainIdentityKey,
  provenCanonicalRoomDomainEnvelopeFromDbRow,
  roomDomainEnvelopeFromDbRow,
  toCanonicalCallRoomContext,
} from "@/lib/chat-domain/room-domain-envelope";
import { isFourDomainPollutionQuarantineRoom } from "@/lib/chat-domain/four-domain-pollution-quarantine";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("roomDomainEnvelopeFromDbRow", () => {
  it("returns proven general_direct envelope", () => {
    expect(
      roomDomainEnvelopeFromDbRow({
        id: "r1",
        chat_domain: "general_direct",
        domain_identity_key: "general_direct:a:b",
      })
    ).toEqual({
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:a:b",
      roomId: "r1",
    });
  });

  it("does not invent general_direct when domain missing", () => {
    expect(
      roomDomainEnvelopeFromDbRow({
        id: "r1",
        direct_key: "a:b",
      })
    ).toBeNull();
  });

  it("maps private_group room_type to group identity for non-insert readers", () => {
    expect(
      roomDomainEnvelopeFromDbRow({
        id: "g1",
        room_type: "private_group",
      })
    ).toEqual({
      chatDomain: "group",
      domainIdentityKey: "group:g1",
      roomId: "g1",
    });
  });

  it("flattens push meta without renaming domain fields", () => {
    const meta = domainEnvelopeToPushMeta({
      chatDomain: "trade",
      domainIdentityKey: "trade:item:s:b",
      roomId: "tr1",
    });
    expect(meta.chat_domain).toBe("trade");
    expect(meta.chatDomain).toBe("trade");
    expect(meta.domain_identity_key).toBe("trade:item:s:b");
    expect(meta.room_id).toBe("tr1");
  });
});

describe("provenCanonicalRoomDomainEnvelopeFromDbRow (call insert SSOT)", () => {
  it("accepts only room columns with canonical identity", () => {
    expect(
      provenCanonicalRoomDomainEnvelopeFromDbRow({
        id: "r1",
        chat_domain: "general_direct",
        domain_identity_key: "general_direct:a:b",
      })
    ).toEqual({
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:a:b",
      roomId: "r1",
    });
  });

  it("rejects invent from room_type even for group", () => {
    expect(
      provenCanonicalRoomDomainEnvelopeFromDbRow({
        id: "g1",
        room_type: "private_group",
      } as { id: string })
    ).toBeNull();
  });

  it("rejects unsorted general_direct pair", () => {
    expect(
      provenCanonicalRoomDomainEnvelopeFromDbRow({
        id: "r1",
        chat_domain: "general_direct",
        domain_identity_key: "general_direct:b:a",
      })
    ).toBeNull();
  });

  it("rejects trade:legacy", () => {
    expect(isCanonicalDomainIdentityKey("trade", "trade:legacy:x:y")).toBe(false);
  });

  it("builds CanonicalCallRoomContext for trade", () => {
    const env = provenCanonicalRoomDomainEnvelopeFromDbRow({
      id: "tr1",
      chat_domain: "trade",
      domain_identity_key: "trade:item1:seller1:buyer1",
    });
    expect(toCanonicalCallRoomContext(env!)).toEqual({
      chatDomain: "trade",
      roomId: "tr1",
      domainIdentityKey: "trade:item1:seller1:buyer1",
      itemId: "item1",
      sellerId: "seller1",
      buyerId: "buyer1",
    });
  });
});

describe("call session domain writer source contract", () => {
  const serviceSrc = readFileSync(
    path.join(process.cwd(), "lib/community-messenger/service.ts"),
    "utf8"
  );
  const startFn = serviceSrc.slice(serviceSrc.indexOf("export async function startCommunityMessengerCallSession"));

  it("refuses null envelope before insert", () => {
    expect(serviceSrc).toContain("provenCanonicalRoomDomainEnvelopeFromDbRow");
    expect(serviceSrc).toContain("isFourDomainPollutionQuarantineRoom");
    expect(startFn).toContain('error: "room_domain_required"');
    expect(startFn).toContain('error: "call_room_quarantined"');
  });

  it("does not fall back to domain-less insert", () => {
    expect(startFn).not.toMatch(/insert\(baseInsert\)/);
    expect(startFn).toContain("chat_domain: callDomainEnvelope.chatDomain");
    expect(startFn).toContain("domain_identity_key: callDomainEnvelope.domainIdentityKey");
  });

  it("quarantine helper recognizes multi-PC room", () => {
    expect(isFourDomainPollutionQuarantineRoom("661e27ad-7c8c-4d9d-a16d-ccab83bc1507")).toBe(true);
    expect(isFourDomainPollutionQuarantineRoom("not-quarantined")).toBe(false);
  });
});
