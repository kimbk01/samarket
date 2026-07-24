import { describe, expect, it } from "vitest";
import {
  computeTier1HeaderInboxDisplayUnread,
  resolveTier1HeaderBellBadgeTotal,
} from "@/lib/notifications/tier1-header-inbox-sync";

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

describe("resolveTier1HeaderBellBadgeTotal (B4)", () => {
  it("tier1_inbox_bell uses badge-count.total only (no storeUnread / no double adminNotice)", () => {
    expect(
      resolveTier1HeaderBellBadgeTotal({
        surface: "tier1_inbox_bell",
        badgeCountTotal: 7,
        storeUnread: 99,
        rowUnread: 3,
        listSynced: true,
        open: false,
        loading: false,
      })
    ).toBe(7);
  });

  it("tier1_inbox_bell adds supplemental only", () => {
    expect(
      resolveTier1HeaderBellBadgeTotal({
        surface: "tier1_inbox_bell",
        badgeCountTotal: 2,
        storeUnread: 0,
        rowUnread: 0,
        listSynced: true,
        open: false,
        loading: false,
        supplementalUnreadCount: 3,
      })
    ).toBe(5);
  });

  it("other surfaces keep unread-badge-store path", () => {
    expect(
      resolveTier1HeaderBellBadgeTotal({
        surface: "owner_commerce_inbox",
        badgeCountTotal: 100,
        storeUnread: 4,
        rowUnread: 1,
        listSynced: true,
        open: false,
        loading: false,
      })
    ).toBe(4);
  });
});
