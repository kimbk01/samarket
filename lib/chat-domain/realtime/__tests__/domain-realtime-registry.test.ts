import { describe, expect, it } from "vitest";
import {
  acceptChatDomainRealtimePayload,
  dispatchChatDomainRealtime,
} from "@/lib/chat-domain/realtime/domain-realtime-registry";

describe("DIBAY ChatDomain Realtime LOCK", () => {
  it("accepts an envelope only through its owner", () => {
    expect(
      dispatchChatDomainRealtime("trade").acceptEnvelope({
        chatDomain: "trade",
        domainIdentityKey: "trade:item:seller:buyer",
        payload: { roomId: "room-1" },
      })
    ).toMatchObject({ chatDomain: "trade" });
    expect(() =>
      dispatchChatDomainRealtime("trade").acceptEnvelope({
        chatDomain: "store_order",
        domainIdentityKey: "store_order:order-1",
        payload: null,
      })
    ).toThrow("dibay_cross_domain_write_forbidden:trade:store_order:realtime");
  });

  it("rejects missing or mismatched stored identity", () => {
    expect(() =>
      acceptChatDomainRealtimePayload({
        chatDomain: "trade",
        roomId: "room-1",
      })
    ).toThrow("dibay_room_identity_required");
    expect(() =>
      acceptChatDomainRealtimePayload(
        {
          chatDomain: "trade",
          domainIdentityKey: "trade:item:seller:buyer",
          roomId: "room-1",
        },
        { domain: "store_order", identityKey: "store_order:order-1" }
      )
    ).toThrow("dibay_realtime_envelope_mismatch");
  });
});
