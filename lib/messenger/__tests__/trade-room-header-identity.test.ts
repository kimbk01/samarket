/**
 * Trade List = product primary; Trade Room Header = viewer-relative counterparty primary.
 * Product context stays separate. Viewer self must never be Room Header identity.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { buildTradeHeaderModel } from "@/lib/messenger/trade/header";
import { resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
import { mapTradeLoaderBatchRows } from "@/lib/messenger/trade/phase11a-db-loader";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import {
  TRADE_PEER_PLACEHOLDER,
  TRADE_PRODUCT_TITLE_PLACEHOLDER,
  type TradeListItem,
} from "@/lib/messenger/trade/types";
import { composeDomainRoomHeaderChrome } from "@/lib/messenger/contracts/domain-room-header-chrome";
import {
  DOMAIN_READ_BUNDLE_KILL_TTL_MS,
  isDomainReadBundleKilled,
  killDomainReadBundle,
  resetDomainReadBundleKillsForTests,
  restoreDomainReadBundle,
} from "@/lib/messenger/contracts/domain-read-surface-canary";
import { resetPhase11dShellReadUiCanaryKillForTests } from "@/lib/messenger/contracts/phase11d-shell-read-ui-canary";

const SELLER = "seller-uuid";
const BUYER = "buyer-uuid";
const ITEM_A = "post-living-room";
const ITEM_B = "post-helmet";

function listItem(partial: Partial<TradeListItem> & { itemId: string }): TradeListItem {
  const identity = buildTradeIdentity({
    itemId: partial.itemId,
    sellerUserId: partial.sellerUserId ?? SELLER,
    counterpartyUserId: partial.counterpartyUserId ?? BUYER,
  });
  return {
    roomId: partial.roomId ?? `room-${partial.itemId}`,
    chatDomain: "trade",
    domainIdentityKey: identity.identityKey,
    itemId: partial.itemId,
    sellerUserId: partial.sellerUserId ?? SELLER,
    counterpartyUserId: partial.counterpartyUserId ?? BUYER,
    itemTitle: partial.itemTitle ?? "Living Room Furniture",
    itemImageUrl:
      partial.itemImageUrl === undefined ? "https://cdn.example/listing.jpg" : partial.itemImageUrl,
    peerDisplayName: partial.peerDisplayName ?? "Tele Gram",
    peerAvatarUrl:
      partial.peerAvatarUrl === undefined ? "https://cdn.example/peer.jpg" : partial.peerAvatarUrl,
    productChatId: partial.productChatId === undefined ? null : partial.productChatId,
    lastMessage: "hi",
    lastMessageAt: "2026-07-14T00:00:00.000Z",
    unreadCount: 0,
    tradeStatusLabel: null,
    updatedAt: "2026-07-14T00:00:00.000Z",
    generation: "1",
  };
}

describe("trade profile identity contracts", () => {
  it("1) buyer viewer → Room Header = seller peer (not product, not self)", () => {
    const item = listItem({
      itemId: ITEM_A,
      peerDisplayName: "판매자 홍길동",
      peerAvatarUrl: "https://cdn.example/seller.jpg",
      itemTitle: "맥북",
      itemImageUrl: "https://cdn.example/mac.jpg",
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(header.peerLabel).toBe("판매자 홍길동");
    expect(header.peerAvatarUrl).toContain("seller.jpg");
    expect(header.productTitle).toBe("맥북");
    expect(header.productImageUrl).toContain("mac.jpg");
    expect(header.peerLabel).not.toBe(TRADE_PRODUCT_TITLE_PLACEHOLDER);
    expect(header.peerAvatarUrl).not.toBe(header.productImageUrl);
  });

  it("2) seller viewer → Room Header = buyer/counterparty peer", () => {
    const item = listItem({
      itemId: ITEM_A,
      peerDisplayName: "구매 희망자 김철수",
      peerAvatarUrl: "https://cdn.example/buyer.jpg",
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: SELLER });
    expect(header.peerLabel).toBe("구매 희망자 김철수");
    expect(header.peerAvatarUrl).toContain("buyer.jpg");
  });

  it("3) same users different listings → distinct keys + separate row identity", () => {
    const a = buildTradeIdentity({ itemId: ITEM_A, sellerUserId: SELLER, counterpartyUserId: BUYER });
    const b = buildTradeIdentity({ itemId: ITEM_B, sellerUserId: SELLER, counterpartyUserId: BUYER });
    expect(a.identityKey).not.toBe(b.identityKey);
    const rows = mapTradeLoaderBatchRows({
      viewerUserId: BUYER,
      rows: [
        {
          roomId: "r-a",
          chatDomain: "trade",
          domainIdentityKey: a.identityKey,
          itemId: ITEM_A,
          sellerUserId: SELLER,
          counterpartyUserId: BUYER,
          itemTitle: "가구",
          itemImageUrl: "https://cdn.example/a.jpg",
          peerDisplayName: "판매자",
          peerAvatarUrl: "https://cdn.example/seller.jpg",
          unreadCount: 0,
          latestMessage: {
            roomId: "r-a",
            bodyText: "a",
            isSystem: false,
            createdAt: "2026-07-14T00:00:00.000Z",
          },
        },
        {
          roomId: "r-b",
          chatDomain: "trade",
          domainIdentityKey: b.identityKey,
          itemId: ITEM_B,
          sellerUserId: SELLER,
          counterpartyUserId: BUYER,
          itemTitle: "헬멧",
          itemImageUrl: "https://cdn.example/b.jpg",
          peerDisplayName: "판매자",
          peerAvatarUrl: "https://cdn.example/seller.jpg",
          unreadCount: 0,
          latestMessage: {
            roomId: "r-b",
            bodyText: "b",
            isSystem: false,
            createdAt: "2026-07-14T00:00:01.000Z",
          },
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.itemTitle).toBe("가구");
    expect(rows[1]!.itemTitle).toBe("헬멧");
    expect(rows[0]!.itemImageUrl).not.toBe(rows[1]!.itemImageUrl);
  });

  it("4) missing listing image keeps product title; does not steal peer avatar", () => {
    const item = listItem({
      itemId: ITEM_A,
      itemImageUrl: null,
      peerAvatarUrl: "https://cdn.example/peer.jpg",
    });
    const presentation = resolveTradePresentationFromListItem(item);
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(presentation.productImageUrl).toBeNull();
    expect(presentation.productTitle).toBe("Living Room Furniture");
    expect(header.peerAvatarUrl).toContain("peer.jpg");
    expect(header.productImageUrl).toBeNull();
  });

  it("5) missing peer image keeps peer name; does not steal listing image", () => {
    const item = listItem({
      itemId: ITEM_A,
      peerAvatarUrl: null,
      itemImageUrl: "https://cdn.example/listing.jpg",
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(header.peerAvatarUrl).toBeNull();
    expect(header.productImageUrl).toContain("listing.jpg");
    expect(header.peerLabel).toBe("Tele Gram");
  });

  it("6) displayed peer must never equal viewer id roles as self header", () => {
    const asBuyer = listItem({
      itemId: ITEM_A,
      peerDisplayName: "판매자",
      peerAvatarUrl: "https://cdn.example/seller.jpg",
    });
    const hBuyer = buildTradeHeaderModel(asBuyer, { viewerUserId: BUYER });
    expect(hBuyer.peerLabel).not.toContain("본인");
    expect(hBuyer.peerAvatarUrl).not.toContain("buyer-self");

    const asSeller = listItem({
      itemId: ITEM_A,
      peerDisplayName: "구매자",
      peerAvatarUrl: "https://cdn.example/buyer.jpg",
    });
    const hSeller = buildTradeHeaderModel(asSeller, { viewerUserId: SELLER });
    expect(hSeller.peerLabel).toBe("구매자");
  });

  it("7) item image and peer image must not be swapped in header model", () => {
    const item = listItem({
      itemId: ITEM_A,
      itemImageUrl: "https://cdn.example/LISTING.png",
      peerAvatarUrl: "https://cdn.example/PEER.png",
      peerDisplayName: "상대방",
      itemTitle: "상품명",
    });
    const header = buildTradeHeaderModel(item, { viewerUserId: BUYER });
    expect(header.peerAvatarUrl).toContain("PEER.png");
    expect(header.productImageUrl).toContain("LISTING.png");
    expect(header.peerLabel).toBe("상대방");
    expect(header.productTitle).toBe("상품명");
  });

  it("list primary stays product; Room chrome secondary is product", () => {
    const chrome = composeDomainRoomHeaderChrome({
      kind: "trade",
      peerLabel: "Peer",
      productTitle: "Sofa",
    });
    expect(chrome.profileKind).toBe("user");
    expect(chrome.forbidsGeneralDirectChrome).toBe(true);
    if (chrome.headerSecondary.mode !== "plain") throw new Error("expected product secondary");
    expect(chrome.headerSecondary.text).toBe("Sofa");
  });

  it("product title placeholder is never the obsolete generic 거래 label", () => {
    expect(TRADE_PRODUCT_TITLE_PLACEHOLDER).not.toBe("거래");
    const item = listItem({ itemId: ITEM_A, itemTitle: "" as unknown as string });
    const emptyTitle = {
      ...item,
      itemTitle: "",
    };
    const p = resolveTradePresentationFromListItem(emptyTitle);
    expect(p.productTitle).toBe(TRADE_PRODUCT_TITLE_PLACEHOLDER);
    expect(p.productTitle).not.toBe("거래");
    expect(TRADE_PEER_PLACEHOLDER).not.toBe("거래");
  });
});

describe("Samsung trade canary kill poison — TTL + restore", () => {
  beforeEach(() => {
    resetDomainReadBundleKillsForTests();
    resetPhase11dShellReadUiCanaryKillForTests();
  });

  it("kill expires after TTL so later devices are not stuck on Legacy", () => {
    killDomainReadBundle("trade", "http_kill");
    expect(isDomainReadBundleKilled("trade")).toBe(true);
    expect(
      isDomainReadBundleKilled("trade", Date.now() + DOMAIN_READ_BUNDLE_KILL_TTL_MS + 1)
    ).toBe(false);
  });

  it("explicit restore clears kill before TTL", () => {
    killDomainReadBundle("trade", "http_kill");
    restoreDomainReadBundle("trade");
    expect(isDomainReadBundleKilled("trade")).toBe(false);
  });
});
