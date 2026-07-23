import { describe, expect, it } from "vitest";
import {
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
  MESSENGER_HOME_SURFACE_INVARIANTS,
} from "@/lib/messenger/contracts/home-surface";
import { composeMessengerShellHome, composeMessengerTabBadge } from "@/lib/messenger/shell";
import { TRADE_LIST_HREF, TRADE_PHASE3_UX_RULES } from "@/lib/messenger/trade/ux-contract";
import { STORE_ORDER_LIST_HREF } from "@/lib/messenger/store-order";

describe("home surface UX contract", () => {
  it("forbids trade/store_order on general inbox list", () => {
    expect(() => assertDomainAllowedOnHomeInboxList("trade")).toThrow(/forbids_domain/);
    expect(() => assertDomainAllowedOnHomeInboxList("store_order")).toThrow(/forbids_domain/);
    expect(() => assertDomainAllowedOnHomeInboxList("general_direct")).not.toThrow();
    expect(() => assertDomainAllowedOnHomeInboxList("group")).not.toThrow();
  });

  it("hub slots are trade and store_order only", () => {
    expect(() => assertDomainIsHomeHubOnly("trade")).not.toThrow();
    expect(() => assertDomainIsHomeHubOnly("store_order")).not.toThrow();
    expect(() => assertDomainIsHomeHubOnly("general_direct")).toThrow(/hub_domain/);
  });

  it("shell home compose keeps hubs separate from inbox rows", () => {
    const home = composeMessengerShellHome({
      generalDirectRows: [
        {
          roomId: "g1",
          chatDomain: "general_direct",
          domainIdentityKey: "general_direct:a:b",
          title: "피어",
          avatarUrl: null,
          previewText: "안녕",
          unreadCount: 0,
          href: "/r",
          lastMessageAt: "2026-07-14T00:00:00.000Z",
        },
      ],
      tradeHub: {
        domain: "trade",
        roomCount: 5,
        unreadCount: 1,
        previewText: "네고",
        lastEventAt: "2026-07-14T00:00:00.000Z",
        latestRoomId: null,
        latestDomainIdentityKey: null,
        hrefToTradeList: TRADE_LIST_HREF,
      },
      storeOrderHub: {
        domain: "store_order",
        roomCount: 3,
        unreadCount: 0,
        previewText: "주문",
        lastEventAt: null,
        latestRoomId: null,
        latestDomainIdentityKey: null,
        hrefToOrderList: STORE_ORDER_LIST_HREF,
      },
    });
    expect(home.tradeHub.roomCount).toBe(5);
    expect(home.storeOrderHub.roomCount).toBe(3);
    expect(home.generalDirectRows[0]?.chatDomain).toBe("general_direct");
    expect(home.groupRows).toHaveLength(0);
    expect(composeMessengerTabBadge({ domain: "general_direct", count: 1 }, { domain: "group", count: 2 })).toBe(3);
  });

  it("locks trade phase3 UX rules and list href", () => {
    expect(TRADE_LIST_HREF).toBe("/community-messenger/trade-chats");
    expect(TRADE_PHASE3_UX_RULES).toContain("home_shows_single_trade_hub_not_trade_rows");
    expect(TRADE_PHASE3_UX_RULES).toContain("unread_excluded_from_messenger_nav_badge");
    expect(MESSENGER_HOME_SURFACE_INVARIANTS.length).toBeGreaterThanOrEqual(8);
  });
});
