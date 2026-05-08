import { describe, expect, it } from "vitest";
import { buildMessengerContextMetaFromProductChatSnapshot } from "@/lib/community-messenger/product-chat-messenger-meta";

describe("buildMessengerContextMetaFromProductChatSnapshot", () => {
  it("builds trade meta with productChatId", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc1",
      productTitle: "테스트 상품",
      price: 20000,
      currency: "PHP",
      role: "buyer",
      sellerListingStateRaw: "inquiry",
      postStatus: "active",
      thumbnailUrl: null,
    });
    expect(m.v).toBe(1);
    expect(m.kind).toBe("trade");
    expect(m.productChatId).toBe("pc1");
    expect(m.postId).toBeUndefined();
    expect(m.headline).toBe("테스트 상품");
    expect(m.priceLabel).toBeTruthy();
    expect(m.roleLabel).toBeTruthy();
    expect(m.itemStateLabel).toBeTruthy();
  });

  it("trims productChatId and postId when listDisplayStringsAlreadyNormalized is unset", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "  pc-space  ",
      postId: "  post-uuid  ",
      productTitle: "t",
      price: 1,
      role: "buyer",
    });
    expect(m.productChatId).toBe("pc-space");
    expect(m.postId).toBe("post-uuid");
  });

  it("includes postId when provided", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pcx",
      postId: "post-uuid-1",
      productTitle: "Y",
      price: 1,
      role: "buyer",
    });
    expect(m.postId).toBe("post-uuid-1");
  });

  it("includes tradeFlowStatus when provided", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc2",
      productTitle: "X",
      price: 100,
      role: "seller",
      tradeFlowStatus: "buyer_confirmed",
    });
    expect(m.tradeFlowStatus).toBe("buyer_confirmed");
  });

  it("includes categoryMenuLabel when provided", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc3",
      productTitle: "Z",
      price: 10,
      role: "buyer",
      categoryMenuLabel: "중고차",
    });
    expect(m.categoryMenuLabel).toBe("중고차");
  });

  it("includes productCategoryLabel when provided", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc4",
      productTitle: "Z",
      price: 10,
      role: "buyer",
      categoryMenuLabel: "중고거래",
      productCategoryLabel: "디지털/가전",
    });
    expect(m.productCategoryLabel).toBe("디지털/가전");
  });

  it("reuses equal priceLabel for same rounded price and currency (memo)", () => {
    const base = {
      productTitle: "x",
      price: 15_000,
      currency: "PHP",
      role: "buyer" as const,
    };
    const a = buildMessengerContextMetaFromProductChatSnapshot({
      ...base,
      productChatId: "pc-p1",
    });
    const b = buildMessengerContextMetaFromProductChatSnapshot({
      ...base,
      productChatId: "pc-p2",
    });
    expect(a.priceLabel).toBeTruthy();
    expect(a.priceLabel).toBe(b.priceLabel);
  });

  it("listDisplayStringsAlreadyNormalized matches trim path when inputs are pre-cleaned", () => {
    const args = {
      productChatId: "pc-trust",
      postId: "p1",
      productTitle: "깨끗한 제목",
      price: 1000,
      currency: "PHP",
      role: "buyer" as const,
      categoryMenuLabel: "중고거래",
      productCategoryLabel: "디지털",
      sellerDisplayName: "판매자",
      thumbnailUrl: "https://cdn.example/thumb.webp",
      sellerListingStateRaw: "inquiry",
      postStatus: "active",
    };
    const trimmed = buildMessengerContextMetaFromProductChatSnapshot(args);
    const trusted = buildMessengerContextMetaFromProductChatSnapshot({
      ...args,
      listDisplayStringsAlreadyNormalized: true,
    });
    expect(trusted).toEqual(trimmed);
  });

  it("trims thumbnailUrl once and omits when whitespace-only", () => {
    const spaced = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc5",
      productTitle: "T",
      price: 0,
      role: "buyer",
      thumbnailUrl: "  https://cdn.example/a.webp  ",
    });
    expect(spaced.thumbnailUrl).toBe("https://cdn.example/a.webp");
    const blank = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc6",
      productTitle: "T",
      price: 0,
      role: "buyer",
      thumbnailUrl: "   ",
    });
    expect(blank.thumbnailUrl).toBeUndefined();
  });
});
