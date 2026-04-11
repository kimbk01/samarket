import { describe, expect, it } from "vitest";
import { buildMessengerContextMetaFromProductChatSnapshot } from "@/lib/community-messenger/product-chat-messenger-meta";

describe("buildMessengerContextMetaFromProductChatSnapshot", () => {
  it("builds trade meta with productChatId", () => {
    const m = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc1",
      productTitle: "테스트 상품",
      price: 20000,
      currency: "PHP",
      tradeFlowStatus: "chatting",
      thumbnailUrl: null,
    });
    expect(m.v).toBe(1);
    expect(m.kind).toBe("trade");
    expect(m.productChatId).toBe("pc1");
    expect(m.headline).toBe("테스트 상품");
    expect(m.priceLabel).toBeTruthy();
    expect(m.stepLabel).toBeTruthy();
  });
});
