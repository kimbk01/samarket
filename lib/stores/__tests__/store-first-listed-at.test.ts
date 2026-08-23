import { describe, expect, it } from "vitest";
import {
  STORE_FIRST_LISTED_AT_COLUMN,
  approvalOrCreateMustNotStampFirstListedAt,
  buildStoreVisibilityWritePatch,
  wouldDbStampFirstListedAt,
} from "@/lib/stores/store-first-listed-at";
import { ADMIN_STORE_PATCH_COMMANDS } from "@/lib/admin-business/admin-store-patch-commands";

const ORIGINAL = "2026-01-15T03:00:00.000Z";

describe("P1-C1 store first_listed_at authority", () => {
  it("column SSOT name is first_listed_at", () => {
    expect(STORE_FIRST_LISTED_AT_COLUMN).toBe("first_listed_at");
  });

  it("T1: first false→true — DB would stamp; app write is visibility-only", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: false,
        nextVisible: true,
        existingFirstListedAt: null,
      })
    ).toBe(true);
    expect(buildStoreVisibilityWritePatch(true)).toEqual({ is_visible: true });
    expect(buildStoreVisibilityWritePatch(true)).not.toHaveProperty("first_listed_at");
  });

  it("T2: true→false — DB would not stamp; app omits first_listed_at", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: true,
        nextVisible: false,
        existingFirstListedAt: ORIGINAL,
      })
    ).toBe(false);
    expect(buildStoreVisibilityWritePatch(false)).toEqual({ is_visible: false });
  });

  it("T3: second false→true — DB preserves original (no stamp)", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: false,
        nextVisible: true,
        existingFirstListedAt: ORIGINAL,
      })
    ).toBe(false);
  });

  it("T4: already visible update — no stamp", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: true,
        nextVisible: true,
        existingFirstListedAt: ORIGINAL,
      })
    ).toBe(false);
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: true,
        nextVisible: true,
        existingFirstListedAt: null,
      })
    ).toBe(false);
  });

  it("T5: approval-only must not stamp (contract)", () => {
    expect(approvalOrCreateMustNotStampFirstListedAt()).toBe(true);
    expect(ADMIN_STORE_PATCH_COMMANDS.approve_store.writes).not.toContain(
      "stores.first_listed_at"
    );
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: false,
        nextVisible: false,
        existingFirstListedAt: null,
      })
    ).toBe(false);
  });

  it("T6: creation-only must not stamp (no visibility transition)", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: false,
        nextVisible: false,
        existingFirstListedAt: null,
      })
    ).toBe(false);
  });

  it("T7: set_store_visible surfaces first_listed_at via DB; HOME/BROWSE/P1-B untouched", () => {
    expect(ADMIN_STORE_PATCH_COMMANDS.set_store_visible.writes).toEqual([
      "stores.is_visible",
      "stores.first_listed_at",
    ]);
    expect(Object.keys(ADMIN_STORE_PATCH_COMMANDS)).not.toContain("set_sort_new");
  });

  it("empty-string existing stamp treated as null (DB would stamp on first publish)", () => {
    expect(
      wouldDbStampFirstListedAt({
        wasVisible: false,
        nextVisible: true,
        existingFirstListedAt: "   ",
      })
    ).toBe(true);
  });

  it("APP/DB double authority: app write patch never carries first_listed_at clock", () => {
    const patch = buildStoreVisibilityWritePatch(true);
    expect(Object.keys(patch)).toEqual(["is_visible"]);
  });
});
