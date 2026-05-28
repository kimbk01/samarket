import { describe, expect, it } from "vitest";
import {
  localizeMainBottomNavFabDisplayItems,
  mainBottomNavFabItemLabelKey,
} from "@/lib/main-menu/main-bottom-nav-fab-i18n";

const t = (key: string) => `i18n:${key}`;

describe("main-bottom-nav-fab-i18n", () => {
  it("mainBottomNavFabItemLabelKey — 배달 FAB id별 키", () => {
    expect(mainBottomNavFabItemLabelKey({ id: "fab_delivery_store_admin", href: "/stores/owner" })).toBe(
      "store_delivery_fab_store"
    );
    expect(mainBottomNavFabItemLabelKey({ id: "fab_delivery_cart", href: "/stores/cart" })).toBe(
      "store_delivery_fab_cart"
    );
  });

  it("localizeMainBottomNavFabDisplayItems — DB 한글 라벨을 catalog로 덮어씀", () => {
    const items = [
      { id: "fab_delivery_orders", label: "주문내역", href: "/orders", icon: "orders" as const },
      { id: "fab_delivery_store_admin", label: "매장 어드민", href: "/stores/owner", icon: "owner_hub" as const },
    ];
    const out = localizeMainBottomNavFabDisplayItems(items, t);
    expect(out[0]?.label).toBe("i18n:store_delivery_float_order_history");
    expect(out[1]?.label).toBe("i18n:store_delivery_fab_store");
  });
});
