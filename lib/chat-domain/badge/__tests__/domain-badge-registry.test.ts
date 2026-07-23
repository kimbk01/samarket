import { describe, expect, it } from "vitest";
import {
  CHAT_DOMAIN_BADGE_PORTS,
  dispatchChatDomainBadge,
} from "@/lib/chat-domain/badge/domain-badge-registry";
import { aggregateChatDomainBadgeShell } from "@/lib/chat-domain/shell/hub-badge-shell-aggregator";

describe("DIBAY ChatDomain Badge registry", () => {
  it("assigns one badge authority to every Domain", () => {
    expect(CHAT_DOMAIN_BADGE_PORTS.general_direct.targetOwner).toBe("chat_room");
    expect(CHAT_DOMAIN_BADGE_PORTS.group.targetOwner).toBe("chat_room");
    expect(CHAT_DOMAIN_BADGE_PORTS.trade.targetOwner).toBe("trade");
    expect(CHAT_DOMAIN_BADGE_PORTS.store_order.targetOwner).toBe("store_order");
  });

  it("rejects cross-domain badge writes and identity mismatches", () => {
    expect(() =>
      dispatchChatDomainBadge("trade").acceptRoom({
        roomId: "room-1",
        chatDomain: "group",
        domainIdentityKey: "group:room-1",
      })
    ).toThrow("dibay_cross_domain_write_forbidden");

    expect(() =>
      dispatchChatDomainBadge("trade").acceptRoom({
        roomId: "room-1",
        chatDomain: "trade",
        domainIdentityKey: "group:room-1",
      })
    ).toThrow("dibay_badge_identity_mismatch");
  });

  it("keeps the Shell read-only and sums Domain results", () => {
    expect(
      aggregateChatDomainBadgeShell(
        {
          general_direct: 2,
          group: 3,
          trade: 4,
          store_order: 5,
        },
        6
      )
    ).toEqual({
      communityMessengerUnread: 5,
      tradeUnread: 4,
      storeOrderChatUnread: 5,
      socialChatUnread: 11,
    });
  });
});
