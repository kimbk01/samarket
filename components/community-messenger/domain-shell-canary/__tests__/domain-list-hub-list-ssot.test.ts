import { describe, expect, it } from "vitest";
import {
  stabilizeSoCustomerListDto,
  stabilizeTradeListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";

describe("domain list stabilize — hub matches list top", () => {
  it("store-order: older hub-looking row loses to newer lastMessageAt as rows[0]", () => {
    const body: SoCustomerListDto = {
      authority: "domain_store_order_customer_list_canary",
      viewerUserId: "u1",
      surfaceRole: "customer",
      producedAt: "2026-07-23T00:00:00.000Z",
      hub: {
        roomCount: 2,
        unreadRoomCount: 1,
        latestRoomId: "room-old",
        previewText: "새 메시지",
      },
      rows: [
        {
          roomId: "room-old",
          chatDomain: "store_order",
          domainIdentityKey: "so:old",
          orderId: "o-old",
          storeName: "CCM CLOTHING LINE",
          storeImageUrl: null,
          previewText: "새 메시지",
          statusBadge: null,
          unreadCount: 0,
          lastMessageAt: "2026-07-21T22:34:00.000Z",
          href: "/x",
          exposesMemberIdentity: false,
        },
        {
          roomId: "room-new",
          chatDomain: "store_order",
          domainIdentityKey: "so:new",
          orderId: "o-new",
          storeName: "TAP SILOG",
          storeImageUrl: null,
          previewText: "QA-IOS-C-so-1",
          statusBadge: "배달완료",
          unreadCount: 1,
          lastMessageAt: "2026-07-22T02:56:36.000Z",
          href: "/y",
          exposesMemberIdentity: false,
        },
      ],
    };
    const next = stabilizeSoCustomerListDto(body);
    expect(next.rows[0]?.roomId).toBe("room-new");
    expect(next.rows[0]?.storeName).toBe("TAP SILOG");
    expect(next.hub.latestRoomId).toBe("room-new");
  });

  it("trade: stabilize picks newest lastMessageAt as hub.latestRoomId", () => {
    const body: TradeListDto = {
      authority: "domain_trade_list_canary",
      viewerUserId: "u1",
      producedAt: "2026-07-23T00:00:00.000Z",
      hub: {
        roomCount: 2,
        unreadRoomCount: 0,
        latestRoomId: "t-old",
        previewText: "old",
      },
      rows: [
        {
          roomId: "t-old",
          chatDomain: "trade",
          domainIdentityKey: "t:old",
          itemId: "i1",
          productTitle: "Old item",
          productImageUrl: null,
          peerLabel: null,
          previewText: "old",
          statusBadge: null,
          unreadCount: 0,
          lastMessageAt: "2026-07-09T08:27:00.000Z",
          href: "/a",
        },
        {
          roomId: "t-new",
          chatDomain: "trade",
          domainIdentityKey: "t:new",
          itemId: "i2",
          productTitle: "New item",
          productImageUrl: null,
          peerLabel: "Shawn",
          previewText: "hi",
          statusBadge: null,
          unreadCount: 0,
          lastMessageAt: "2026-07-22T02:56:00.000Z",
          href: "/b",
        },
      ],
    };
    const next = stabilizeTradeListDto(body);
    expect(next.hub.latestRoomId).toBe("t-new");
    expect(next.rows[0]?.roomId).toBe("t-new");
  });
});
