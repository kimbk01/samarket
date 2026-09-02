import { describe, expect, it } from "vitest";
import {
  buildDomainRealtimeDedupeKey,
  buildDomainRealtimeEnvelope,
  buildLegacyRoomBumpDedupeKey,
  parseDomainRealtimeEnvelopeFromBumpPayload,
  resolveRoomBumpDedupeKey,
} from "@/lib/chat-domain/realtime/domain-realtime-envelope";

describe("Phase E domain realtime envelope", () => {
  it("builds envelope and dedupe key", () => {
    const env = buildDomainRealtimeEnvelope({
      chatDomain: "general_direct",
      domainIdentity: "gd:a:b",
      roomId: "r1",
      eventId: "m1",
    });
    expect(env).toMatchObject({
      v: 1,
      kind: "room_bump",
      chatDomain: "general_direct",
      domainIdentity: "gd:a:b",
      roomId: "r1",
      eventId: "m1",
    });
    expect(buildDomainRealtimeDedupeKey(env!)).toBe(["general_direct", "gd:a:b", "m1"].join("\0"));
  });

  it("includes seq in dedupe when present", () => {
    expect(
      buildDomainRealtimeDedupeKey({
        chatDomain: "trade",
        domainIdentity: "trade:i:a:b",
        eventId: "e1",
        seq: 9,
      }),
    ).toBe(["trade", "trade:i:a:b", "e1", "9"].join("\0"));
  });

  it("parses bump payload with domain; legacy without", () => {
    const withDomain = parseDomainRealtimeEnvelopeFromBumpPayload({
      v: 2,
      roomId: "r1",
      canonicalRoomId: "r1",
      fromUserId: "u1",
      at: "t1",
      messageId: "m9",
      chatDomain: "group",
      domainIdentity: "group:r1",
    });
    expect(withDomain?.eventId).toBe("m9");
    expect(resolveRoomBumpDedupeKey({
      fromUserId: "u1",
      messageId: "m9",
      at: "t1",
      chatDomain: "group",
      domainIdentity: "group:r1",
      roomId: "r1",
    })).toBe(["group", "group:r1", "m9", "t1"].join("\0"));

    expect(parseDomainRealtimeEnvelopeFromBumpPayload({
      v: 2,
      roomId: "r1",
      fromUserId: "u1",
      at: "t1",
      messageId: "m9",
    })).toBeNull();

    expect(
      resolveRoomBumpDedupeKey({
        fromUserId: "u1",
        messageId: "m9",
        at: "t1",
      }),
    ).toBe(buildLegacyRoomBumpDedupeKey({ fromUserId: "u1", messageId: "m9", at: "t1" }));
  });

  it("rejects invalid domain", () => {
    expect(
      buildDomainRealtimeEnvelope({
        chatDomain: "community" as never,
        domainIdentity: "x",
        roomId: "r",
        eventId: "e",
      }),
    ).toBeNull();
  });
});
