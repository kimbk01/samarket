import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  clearStoreCouponHandoff,
  readStoreCouponHandoff,
  writeStoreCouponHandoff,
} from "@/lib/stores/store-coupon-handoff";

describe("store-coupon-handoff v2 (SSOT authority)", () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;

  beforeEach(() => {
    mem.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: storage,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("requires storeId + userCouponId; couponNumber optional for display", () => {
    writeStoreCouponHandoff({
      storeId: "s1",
      userCouponId: "",
      offerId: "c1",
    });
    expect(readStoreCouponHandoff("s1")).toBeNull();

    writeStoreCouponHandoff({
      storeId: "s1",
      userCouponId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      offerId: "c1",
    });
    const h = readStoreCouponHandoff("s1");
    expect(h?.userCouponId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(h?.offerId).toBe("c1");
    expect(h?.couponNumber).toBe("");
    clearStoreCouponHandoff();
    expect(readStoreCouponHandoff("s1")).toBeNull();
  });
});
