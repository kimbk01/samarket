/**
 * Trade loader peer selection — header secondary must be viewer-relative counterparty, never hard-coded seller.
 */
import { describe, expect, it } from "vitest";
import { mapTradeLoaderBatchRows } from "@/lib/messenger/trade/phase11a-db-loader";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";

function tradeRow(input: {
  viewerAs: "seller" | "counterparty";
  sellerName: string;
  counterpartyName: string;
}) {
  const sellerUserId = "seller-1";
  const counterpartyUserId = "buyer-1";
  const identity = buildTradeIdentity({
    itemId: "item-macbook",
    sellerUserId,
    counterpartyUserId,
  });
  const peerIsCounterparty = input.viewerAs === "seller";
  return {
    roomId: "room-trade-1",
    chatDomain: "trade" as const,
    domainIdentityKey: identity.identityKey,
    itemId: "item-macbook",
    sellerUserId,
    counterpartyUserId,
    itemTitle: "맥북 프로 M3",
    itemImageUrl: "https://cdn.example/mac.jpg",
    peerDisplayName: peerIsCounterparty ? input.counterpartyName : input.sellerName,
    peerAvatarUrl: null,
    unreadCount: 0,
    latestMessage: {
      roomId: "room-trade-1",
      bodyText: "hi",
      isSystem: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    },
  };
}

describe("trade header peer secondary follows viewer role", () => {
  it("seller viewer sees counterparty name as peerDisplayName", () => {
    const mapped = mapTradeLoaderBatchRows({
      viewerUserId: "seller-1",
      rows: [
        tradeRow({
          viewerAs: "seller",
          sellerName: "판매자 본인",
          counterpartyName: "구매 희망자 김철수",
        }),
      ],
    });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.itemTitle).toBe("맥북 프로 M3");
    expect(mapped[0]!.itemImageUrl).toContain("mac.jpg");
    expect(mapped[0]!.peerDisplayName).toBe("구매 희망자 김철수");
    expect(mapped[0]!.sellerUserId).toBe("seller-1");
    expect(mapped[0]!.counterpartyUserId).toBe("buyer-1");
  });

  it("counterparty viewer sees seller name as peerDisplayName", () => {
    const mapped = mapTradeLoaderBatchRows({
      viewerUserId: "buyer-1",
      rows: [
        tradeRow({
          viewerAs: "counterparty",
          sellerName: "판매자 홍길동",
          counterpartyName: "구매자 본인",
        }),
      ],
    });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.peerDisplayName).toBe("판매자 홍길동");
  });

  it("same peers different item keep distinct identity keys", () => {
    const a = buildTradeIdentity({
      itemId: "item-a",
      sellerUserId: "s1",
      counterpartyUserId: "c1",
    }).identityKey;
    const b = buildTradeIdentity({
      itemId: "item-b",
      sellerUserId: "s1",
      counterpartyUserId: "c1",
    }).identityKey;
    expect(a).not.toBe(b);
  });
});
