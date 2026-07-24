import { describe, expect, it } from "vitest";
import {
  domainEnvelopeToPushMeta,
  roomDomainEnvelopeFromDbRow,
} from "@/lib/chat-domain/room-domain-envelope";

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

  it("maps private_group room_type to group identity", () => {
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
