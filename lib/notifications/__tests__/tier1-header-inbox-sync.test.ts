import { describe, expect, it } from "vitest";
import { computeTier1HeaderInboxDisplayUnread } from "@/lib/notifications/tier1-header-inbox-sync";

describe("computeTier1HeaderInboxDisplayUnread", () => {
  it("uses API store count when list is synced (ignores partial rowUnread)", () => {
    expect(
      computeTier1HeaderInboxDisplayUnread({
        storeUnread: 75,
        rowUnread: 65,
        listSynced: true,
        open: false,
        loading: false,
      })
    ).toBe(75);
  });

  it("uses store count when panel closed", () => {
    expect(
      computeTier1HeaderInboxDisplayUnread({
        storeUnread: 10,
        rowUnread: 3,
        listSynced: false,
        open: false,
        loading: false,
      })
    ).toBe(10);
  });

  it("while open and loading uses max of store and rows", () => {
    expect(
      computeTier1HeaderInboxDisplayUnread({
        storeUnread: 5,
        rowUnread: 8,
        listSynced: false,
        open: true,
        loading: true,
      })
    ).toBe(8);
  });
});
