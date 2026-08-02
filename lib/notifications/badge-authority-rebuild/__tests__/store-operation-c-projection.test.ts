/**
 * Slice 2-5 — C_store runtime projection tests.
 * Does not import Bell / App Icon / FCM / Native.
 */
import { describe, expect, it } from "vitest";
import {
  STORE_OPERATION_C_PROJECTION,
  cStoreIgnoresFabOwnerOrdersTarget,
  cStoreOwnerReviewAttentionBlocked,
  resolveCStoreInquiryActionCount,
  resolveCStoreOrderActionCount,
  resolveOwnerOperationAttentionCountForStore,
} from "@/lib/notifications/badge-authority-rebuild/store-operation-c-projection";
import { forbidMaxAsCStoreAuthority } from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";
import {
  resolveFabOwnerOrderChatBadgeCount,
  resolveFabOwnerOrdersBadgeCount,
  resolveFabOwnerStoreBadgeCount,
  resolveOwnerOperationsCenterAttentionCount,
  resolveOwnerPresentationTotalBadgeCount,
} from "@/lib/delivery/owner/owner-store-badge-display-policy";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";

describe("Slice 2-5 store-operation-c-projection", () => {
  it("locks projection id", () => {
    expect(STORE_OPERATION_C_PROJECTION).toBe("store_operation_c_projection_v1");
  });

  it("sums pending+refund+cancel+inquiry for one store", () => {
    expect(
      resolveOwnerOperationAttentionCountForStore("store-a", {
        pendingOrderActions: 1,
        refundActions: 1,
        cancelActions: 1,
        openInquiryActions: 2,
      })
    ).toBe(5);
  });

  it("empty storeId yields 0", () => {
    expect(
      resolveOwnerOperationAttentionCountForStore("", {
        pendingOrderActions: 9,
        refundActions: 0,
        cancelActions: 0,
        openInquiryActions: 0,
      })
    ).toBe(0);
  });

  it("store A formula does not use store B id", () => {
    const counts = {
      pendingOrderActions: 3,
      refundActions: 0,
      cancelActions: 0,
      openInquiryActions: 0,
    };
    expect(resolveOwnerOperationAttentionCountForStore("store-a", counts)).toBe(3);
    expect(resolveOwnerOperationAttentionCountForStore("store-b", counts)).toBe(3);
  });

  it("order digit excludes inquiry; inquiry digit excludes review", () => {
    const counts = {
      pendingOrderActions: 2,
      refundActions: 1,
      cancelActions: 1,
      openInquiryActions: 4,
    };
    expect(resolveCStoreOrderActionCount(counts)).toBe(4);
    expect(resolveCStoreInquiryActionCount(counts)).toBe(4);
    expect(cStoreOwnerReviewAttentionBlocked()).toBe(0);
  });

  it("forbids max dual authority and ignores fab_owner_orders", () => {
    expect(forbidMaxAsCStoreAuthority(2, 9).ok).toBe(false);
    expect(cStoreIgnoresFabOwnerOrdersTarget(99)).toBe(true);
  });
});

describe("Slice 2-5 Owner FAB / Header C vs B separation", () => {
  function bd(overrides: Partial<OwnerHubBadgeBreakdown> = {}): OwnerHubBadgeBreakdown {
    return {
      ...OWNER_HUB_BADGE_EMPTY,
      orderAttention: 5,
      inquiryAttention: 1,
      ownerReviewAttention: 99,
      storeOrderChatUnread: 8,
      ...overrides,
    };
  }

  it("FAB store ignores REVIEW (UNKNOWN_BLOCKED)", () => {
    expect(resolveFabOwnerStoreBadgeCount(bd())).toBe(1);
  });

  it("ops center is C only (no B chat)", () => {
    expect(resolveOwnerOperationsCenterAttentionCount(bd())).toBe(6);
    expect(resolveFabOwnerOrderChatBadgeCount(bd())).toBe(8);
  });

  it("presentation total is B+C and not used as C authority", () => {
    expect(resolveOwnerPresentationTotalBadgeCount(bd())).toBe(14);
    expect(resolveFabOwnerOrdersBadgeCount(bd())).toBe(5);
  });
});
