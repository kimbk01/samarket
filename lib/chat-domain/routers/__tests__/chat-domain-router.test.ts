import { describe, expect, it } from "vitest";
import {
  assertMessengerRoomEntryContract,
  dispatchChatDomainRouter,
} from "@/lib/chat-domain/routers/chat-domain-router";

describe("DIBAY ChatDomain Router LOCK", () => {
  const cases = [
    ["general_direct", "general_direct:user-a:user-b", null],
    ["group", "group:room-1", null],
    ["trade", "trade:item-1:seller-1:buyer-1", "trade"],
    ["store_order", "store_order:order-1", "delivery"],
  ] as const;

  it.each(cases)("routes %s from stored domain only", (domain, identityKey, listSource) => {
    const href = dispatchChatDomainRouter(domain).buildRoomHref({
      roomId: "room-1",
      domain,
      identityKey,
    });
    expect(href).toContain("/community-messenger/rooms/room-1");
    if (listSource) expect(href).toContain(`cm_list=${listSource}`);
    else expect(href).not.toContain("cm_list=");
  });

  it("rejects cross-domain router writes", () => {
    expect(() =>
      dispatchChatDomainRouter("trade").buildRoomHref({
        roomId: "room-1",
        domain: "store_order",
        identityKey: "store_order:order-1",
      })
    ).toThrow("dibay_cross_domain_write_forbidden");
  });

  it("rejects missing or mismatched entry identity", () => {
    expect(() =>
      assertMessengerRoomEntryContract({
        chatDomain: "trade",
        domainIdentityKey: "store_order:order-1",
      })
    ).toThrow("dibay_chat_domain_router_identity_mismatch");

    expect(() =>
      assertMessengerRoomEntryContract(
        {
          chatDomain: "trade",
          domainIdentityKey: "trade:item-1:seller-1:buyer-1",
        },
        {
          domain: "trade",
          identityKey: "trade:item-2:seller-1:buyer-1",
        }
      )
    ).toThrow("dibay_chat_domain_router_entry_mismatch");
  });
});
