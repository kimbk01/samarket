/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  isStoreMenuFocusStickyGeometryReady,
  storeMenuFocusEntryNeedsPreparation,
} from "@/lib/dibay/store-menu-focus-entry";

describe("store-menu-focus-entry", () => {
  it("needs preparation only when focusProduct present", () => {
    expect(storeMenuFocusEntryNeedsPreparation(null)).toBe(false);
    expect(storeMenuFocusEntryNeedsPreparation("")).toBe(false);
    expect(storeMenuFocusEntryNeedsPreparation("abc")).toBe(true);
  });

  it("sticky READY requires 0 < sticky < viewport", () => {
    expect(isStoreMenuFocusStickyGeometryReady(754, 601)).toBe(false);
    expect(isStoreMenuFocusStickyGeometryReady(0, 601)).toBe(false);
    expect(isStoreMenuFocusStickyGeometryReady(105, 601)).toBe(true);
  });
});
