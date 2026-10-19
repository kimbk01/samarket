import { describe, expect, it } from "vitest";
import {
  currentStoreDistanceMode,
  isStoreDistanceMode,
  mergeStoreDistanceOverride,
} from "@/lib/admin-business/admin-store-distance-override";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("store distance override merge (DEF-58)", () => {
  it("validates modes", () => {
    expect(isStoreDistanceMode("enabled")).toBe(true);
    expect(isStoreDistanceMode("on")).toBe(false);
  });

  it("changes only this store and keeps other stores' entries", () => {
    const current = { stores: { [B]: { mode: "disabled", maxKm: null } } };
    const merged = mergeStoreDistanceOverride(current, A, "enabled");
    expect(merged.stores[A]).toEqual({ mode: "enabled", maxKm: null });
    expect(merged.stores[B]?.mode).toBe("disabled");
  });

  it("inherit removes the entry; reads default inherit", () => {
    const current = { stores: { [A]: { mode: "enabled" }, [B]: { mode: "disabled" } } };
    expect(currentStoreDistanceMode(current, A)).toBe("enabled");
    const merged = mergeStoreDistanceOverride(current, A, "inherit");
    expect(merged.stores[A]).toBeUndefined();
    expect(merged.stores[B]?.mode).toBe("disabled");
    expect(currentStoreDistanceMode(null, A)).toBe("inherit");
  });
});
