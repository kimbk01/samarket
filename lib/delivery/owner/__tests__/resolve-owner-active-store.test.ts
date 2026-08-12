import { describe, expect, it } from "vitest";
import {
  resolveOwnerActiveStoreId,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";
import {
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  isOwnerStoreCommerceNotificationRow,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { isOwnerStoreOperationMetaKind } from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

describe("OWNER ACTIVE STORE AUTHORITY MODEL A", () => {
  const stores = [{ id: "store-a" }, { id: "store-b" }];

  it("prefers valid route storeId over preferred and newest", () => {
    expect(
      resolveOwnerActiveStoreId({
        stores,
        routeStoreId: "store-a",
        preferredStoreId: "store-b",
      })
    ).toBe("store-a");
  });

  it("uses preferred when route missing", () => {
    expect(
      resolveOwnerActiveStoreId({
        stores,
        routeStoreId: null,
        preferredStoreId: "store-b",
      })
    ).toBe("store-b");
  });

  it("ignores route/preferred not in owned list", () => {
    expect(
      resolveOwnerActiveStoreId({
        stores,
        routeStoreId: "store-x",
        preferredStoreId: "store-y",
      })
    ).toBe("store-a");
  });

  it("resolveOwnerActiveStoreRow returns same identity", () => {
    const row = resolveOwnerActiveStoreRow(stores, {
      routeStoreId: "store-b",
      preferredStoreId: "store-a",
    });
    expect(row?.id).toBe("store-b");
  });
});

describe("Owner point orphan + sold_out kind contract", () => {
  const pointKinds = [
    "store_point_blocked",
    "store_point_deducted",
    "store_point_low",
    "store_point_charge_approved",
    "store_point_charge_rejected",
    "store_point_account_replied",
  ] as const;

  it("includes store_point_* and sold_out in Owner commerce kinds", () => {
    expect(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has("store_order_sold_out")).toBe(true);
    for (const kind of pointKinds) {
      expect(OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)).toBe(true);
      expect(isOwnerStoreOperationMetaKind(kind)).toBe(true);
      expect(isOwnerStoreCommerceNotificationRow({ meta: { kind, store_id: "s1" } })).toBe(true);
    }
  });

  it("keeps store_point_* out of Member A", () => {
    for (const kind of pointKinds) {
      expect(
        isMemberNotificationAUnread({
          id: `e-${kind}`,
          type: "commerce",
          unread: true,
          read_at: null,
          meta: { kind, store_id: "s1" },
        })
      ).toBe(false);
    }
  });
});
