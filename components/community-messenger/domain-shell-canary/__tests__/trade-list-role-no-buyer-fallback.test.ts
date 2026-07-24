import { describe, expect, it } from "vitest";
import { stabilizeTradeListDto } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { filterTradeListRowsByRole } from "@/lib/messenger/trade/list-sort-filter";

const SELLER = "seller-uuid";
const BUYER = "buyer-uuid";
const ITEM = "item-uuid";

function legacyCacheBody(viewerUserId: string, withParties: boolean): TradeListDto {
  return {
    authority: "domain_trade_list_canary",
    viewerUserId,
    producedAt: "2026-07-23T00:00:00.000Z",
    hub: {
      roomCount: 1,
      unreadRoomCount: 0,
      latestRoomId: "r1",
      previewText: "hi",
    },
    rows: [
      {
        roomId: "r1",
        chatDomain: "trade",
        domainIdentityKey: `trade:${ITEM}:${SELLER}:${BUYER}`,
        itemId: ITEM,
        ...(withParties
          ? { sellerUserId: SELLER, buyerUserId: BUYER }
          : {}),
        // legacy cache: no viewerRole
        productTitle: "Bike",
        productImageUrl: null,
        peerLabel: "Peer",
        peerAvatarUrl: null,
        previewText: "hi",
        statusBadge: "판매중",
        unreadCount: 0,
        lastMessageAt: "2026-07-22T00:00:00.000Z",
        href: "/community-messenger/rooms/r1",
      },
    ],
  };
}

describe("stabilizeTradeListDto — no buyer fallback", () => {
  it("A: legacy cache as seller reconstructs seller role from parties", () => {
    const result = stabilizeTradeListDto(legacyCacheBody(SELLER, true));
    expect(result.droppedInvalidCount).toBe(0);
    expect(result.dto.rows).toHaveLength(1);
    expect(result.dto.rows[0]!.viewerRole).toBe("seller");
    expect(result.reconstructedRoleCount).toBeGreaterThan(0);
    expect(result.needsBackgroundRefetch).toBe(false);
  });

  it("B: legacy cache as buyer reconstructs buyer role from identity key alone", () => {
    const result = stabilizeTradeListDto(legacyCacheBody(BUYER, false));
    expect(result.droppedInvalidCount).toBe(0);
    expect(result.dto.rows[0]!.viewerRole).toBe("buyer");
    expect(result.dto.rows[0]!.sellerUserId).toBe(SELLER);
    expect(result.dto.rows[0]!.buyerUserId).toBe(BUYER);
  });

  it("C: invalid identity drops row — never buyer fallback", () => {
    const body = legacyCacheBody("stranger-uuid", false);
    body.rows[0]!.domainIdentityKey = "trade:broken";
    delete body.rows[0]!.sellerUserId;
    delete body.rows[0]!.buyerUserId;
    const result = stabilizeTradeListDto(body);
    expect(result.dto.rows).toHaveLength(0);
    expect(result.droppedInvalidCount).toBe(1);
    expect(result.needsBackgroundRefetch).toBe(true);
    expect(result.reconstructedRoleCount).toBe(0);
  });

  it("E: role filters respect reconstructed roles", () => {
    const sellerView = stabilizeTradeListDto(legacyCacheBody(SELLER, false)).dto.rows;
    const buyerView = stabilizeTradeListDto(legacyCacheBody(BUYER, false)).dto.rows;
    expect(filterTradeListRowsByRole(sellerView as never, "selling")).toHaveLength(1);
    expect(filterTradeListRowsByRole(sellerView as never, "buying")).toHaveLength(0);
    expect(filterTradeListRowsByRole(buyerView as never, "buying")).toHaveLength(1);
    expect(filterTradeListRowsByRole(buyerView as never, "selling")).toHaveLength(0);
  });

  it("D: hydrate stability — cache reconstruct matches API shape role", () => {
    const fromCache = stabilizeTradeListDto(legacyCacheBody(SELLER, false)).dto;
    const fromApi = stabilizeTradeListDto({
      ...legacyCacheBody(SELLER, true),
      rows: [
        {
          ...legacyCacheBody(SELLER, true).rows[0]!,
          viewerRole: "seller",
        },
      ],
    }).dto;
    expect(fromCache.rows[0]!.viewerRole).toBe(fromApi.rows[0]!.viewerRole);
    expect(fromCache.rows[0]!.sellerUserId).toBe(fromApi.rows[0]!.sellerUserId);
    expect(fromCache.rows[0]!.buyerUserId).toBe(fromApi.rows[0]!.buyerUserId);
  });
});
