import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ownerPresentationTotal } from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  resolveBottomNavStoresTabBadgeForOwnerStore,
  resolveFabOwnerOrderChatBadgeCount,
  resolveFabOwnerOrdersBadgeCount,
  resolveFabOwnerStoreBadgeCount,
} from "@/lib/delivery/owner/owner-store-badge-display-policy";

function sampleBreakdown(overrides: Partial<OwnerHubBadgeBreakdown> = {}): OwnerHubBadgeBreakdown {
  return {
    chatUnread: 0,
    communityMessengerUnread: 3,
    philifeChatUnread: 2,
    socialChatUnread: 5,
    storeOrderChatUnread: 8,
    storeOrderOwnerUnreadRooms: 8,
    orderAttention: 5,
    inquiryAttention: 1,
    ownerReviewAttention: 2,
    storesTabAttention: 0,
    buyerOrderAttention: 4,
    storeDeepLink: null,
    total: 8,
    ...overrides,
  };
}

describe("owner FAB badge display (3-way split)", () => {
  it("maps FAB rows independently", () => {
    const bd = sampleBreakdown();
    expect(resolveFabOwnerOrdersBadgeCount(bd)).toBe(5);
    expect(resolveFabOwnerStoreBadgeCount(bd)).toBe(1);
    expect(resolveFabOwnerOrderChatBadgeCount(bd)).toBe(8);
  });

  it("hides bottom nav stores tab badge for owner hub store", () => {
    const bd = sampleBreakdown({ storesTabAttention: 4, buyerOrderAttention: 4 });
    expect(resolveBottomNavStoresTabBadgeForOwnerStore(bd, true)).toBe(0);
    expect(resolveBottomNavStoresTabBadgeForOwnerStore(bd, false)).toBe(4);
  });

  it("F4: collapsed FAB digit = owner rooms + operation attention (sum, not max)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../components/layout/MainBottomNavFabSector.tsx"), "utf8");
    expect(src).toContain("ownerPresentationTotal(fabOrderChatBadge, fabOrdersBadge + fabStoreBadge).total");
    expect(src).not.toContain("Math.max(fabOrdersBadge, fabStoreBadge, fabOrderChatBadge)");
    expect(ownerPresentationTotal(3, 2 + 1).total).toBe(6);
  });
});
