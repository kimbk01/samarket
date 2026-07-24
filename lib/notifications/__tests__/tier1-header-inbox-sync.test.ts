import { describe, expect, it, beforeEach } from "vitest";
import {
  resolveTier1HeaderBellBadgeTotal,
  computeTier1HeaderInboxDisplayUnread,
} from "@/lib/notifications/tier1-header-inbox-sync";

describe("computeTier1HeaderInboxDisplayUnread (legacy helper)", () => {
  it("uses API store count when list is synced", () => {
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
});

describe("resolveTier1HeaderBellBadgeTotal (Domain Bell SSOT)", () => {
  it("L. all surfaces use badgeCountTotal only (route consistency)", () => {
    for (const surface of [
      "tier1_inbox_bell",
      "bottom_nav_chat",
      "bottom_nav_community",
      "bottom_nav_my",
      "bottom_nav_delivery",
      "owner_commerce_inbox",
    ] as const) {
      expect(
        resolveTier1HeaderBellBadgeTotal({
          surface,
          badgeCountTotal: 7,
          storeUnread: 99,
          rowUnread: 3,
          listSynced: true,
          open: false,
          loading: false,
          supplementalUnreadCount: 5,
        })
      ).toBe(7);
    }
  });

  it("ignores supplemental re-add", () => {
    expect(
      resolveTier1HeaderBellBadgeTotal({
        surface: "tier1_inbox_bell",
        badgeCountTotal: 2,
        supplementalUnreadCount: 3,
        storeUnread: 0,
        rowUnread: 0,
        listSynced: true,
        open: false,
        loading: false,
      })
    ).toBe(2);
  });
});
