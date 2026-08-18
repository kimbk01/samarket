import { describe, expect, it } from "vitest";
import {
  isUnusableStoreOrderDisplayName,
  resolveStoreOrderDisplayIdentity,
  STORE_ORDER_DISPLAY_STORE_FALLBACK,
} from "@/lib/community-messenger/store-order-display-identity";

describe("resolveStoreOrderDisplayIdentity", () => {
  it("uses storeDisplayName from delivery meta", () => {
    const id = resolveStoreOrderDisplayIdentity({
      summary: "",
      messengerDirectKey: null,
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeDisplayName: "맛업는식당",
        storeId: "s1",
      },
    });
    expect(id?.storeName).toBe("맛업는식당");
    expect(id?.hasResolvedStoreName).toBe(true);
  });

  it("does not use GENERAL placeholder as store name", () => {
    const id = resolveStoreOrderDisplayIdentity({
      summary: "",
      messengerDirectKey: null,
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeDisplayName: "새 대화",
        storeId: "s1",
      },
    });
    expect(id?.storeName).toBe(STORE_ORDER_DISPLAY_STORE_FALLBACK);
    expect(id?.hasResolvedStoreName).toBe(false);
    expect(isUnusableStoreOrderDisplayName("New conversation")).toBe(true);
  });
});
