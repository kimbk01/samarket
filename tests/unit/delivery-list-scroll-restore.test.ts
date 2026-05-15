import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  buildDeliveryListScrollRouteKey,
  consumeDeliveryListScrollPopstatePending,
  isDeliveryListScrollRoute,
  isStoreConsumerDetailPath,
  noteDeliveryListScrollPopstatePending,
  resetDeliveryListScrollRestoreForTests,
} from "@/lib/dibay/delivery-list-scroll-restore";

function mockSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: () => null,
    length: store.size,
    clear: () => store.clear(),
  });
  return store;
}

describe("delivery-list-scroll-restore", () => {
  beforeEach(() => {
    mockSessionStorage();
    resetDeliveryListScrollRestoreForTests();
  });

  it("builds stable route keys", () => {
    expect(buildDeliveryListScrollRouteKey("/stores", "")).toBe("/stores");
    expect(buildDeliveryListScrollRouteKey("/stores/browse/restaurant", "?sub=korean")).toBe(
      "/stores/browse/restaurant?sub=korean"
    );
  });

  it("recognizes delivery list routes", () => {
    expect(isDeliveryListScrollRoute("/stores")).toBe(true);
    expect(isDeliveryListScrollRoute("/stores/search?q=치킨")).toBe(true);
    expect(isDeliveryListScrollRoute("/stores/browse/restaurant?sub=all")).toBe(true);
    expect(isDeliveryListScrollRoute("/stores/my-slug")).toBe(false);
  });

  it("recognizes consumer store detail paths", () => {
    expect(isStoreConsumerDetailPath("/stores/my-slug")).toBe(true);
    expect(isStoreConsumerDetailPath("/stores/my-slug/cart")).toBe(true);
    expect(isStoreConsumerDetailPath("/stores/browse/restaurant")).toBe(false);
    expect(isStoreConsumerDetailPath("/stores/owner")).toBe(false);
    expect(isStoreConsumerDetailPath("/stores")).toBe(false);
  });

  it("does not clear pending for a different route key", () => {
    noteDeliveryListScrollPopstatePending("/stores");
    expect(consumeDeliveryListScrollPopstatePending("/stores/browse/restaurant")).toBe(false);
    expect(consumeDeliveryListScrollPopstatePending("/stores")).toBe(true);
  });
});
