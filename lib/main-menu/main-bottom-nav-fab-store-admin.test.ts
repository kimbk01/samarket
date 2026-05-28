import { describe, expect, it } from "vitest";
import {
  applyMainBottomNavFabStoreAdminGate,
  createMainBottomNavFabStoreAdminItem,
  ensureStoreAdminFabItemForApprovedOwner,
  isMainBottomNavFabStoreAdminItem,
} from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

const approvedStore = {
  id: "store-uuid-1",
  approval_status: "approved",
} as StoreRow;

describe("main-bottom-nav-fab-store-admin", () => {
  it("isMainBottomNavFabStoreAdminItem", () => {
    expect(isMainBottomNavFabStoreAdminItem(createMainBottomNavFabStoreAdminItem())).toBe(true);
    expect(isMainBottomNavFabStoreAdminItem({ id: "x", href: "/stores/owner" })).toBe(true);
  });

  it("applyMainBottomNavFabStoreAdminGate — 승인 매장 없으면 매장 어드민 항목 제거", () => {
    const items = [
      { id: "fab_delivery_store_admin", label: "A", href: "/stores/owner", icon: "owner_hub" as const },
      { id: "fab_delivery_cart", label: "B", href: "/stores/cart", icon: "cart" as const },
    ];
    expect(applyMainBottomNavFabStoreAdminGate(items, null)).toHaveLength(1);
    expect(applyMainBottomNavFabStoreAdminGate(items, null)[0]?.id).toBe("fab_delivery_cart");
  });

  it("applyMainBottomNavFabStoreAdminGate — 승인 매장이면 hub URL 보정", () => {
    const items = [
      { id: "fab_delivery_store_admin", label: "A", href: "/stores/owner", icon: "owner_hub" as const },
    ];
    const out = applyMainBottomNavFabStoreAdminGate(items, approvedStore);
    expect(out).toHaveLength(1);
    expect(out[0]?.href).toBe("/stores/owner?storeId=store-uuid-1");
  });

  it("ensureStoreAdminFabItemForApprovedOwner — DB에 없어도 승인 매장주에게 주입", () => {
    const items = [
      { id: "fab_delivery_cart", label: "B", href: "/stores/cart", icon: "cart" as const },
    ];
    const out = ensureStoreAdminFabItemForApprovedOwner(items, approvedStore);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("fab_delivery_store_admin");
    expect(out[0]?.href).toContain("store-uuid-1");
  });
});
