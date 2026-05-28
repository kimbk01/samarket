import type { MessageKey } from "@/lib/i18n/messages";
import { isMainBottomNavFabStoreAdminItem } from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import type {
  MainBottomNavFabDisplayItem,
  MainBottomNavFabStoredConfig,
  MainBottomNavFabStoredItem,
} from "@/lib/main-menu/main-bottom-nav-fab-types";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import {
  MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID,
  createMainBottomNavFabStoreAdminItem,
} from "@/lib/main-menu/main-bottom-nav-fab-store-admin";

const FAB_ITEM_LABEL_KEY_BY_ID: Partial<Record<string, MessageKey>> = {
  [MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID]: "store_delivery_fab_store",
  fab_delivery_orders: "store_delivery_float_order_history",
  fab_delivery_cart: "store_delivery_fab_cart",
  fab_delivery_order_chat: "store_delivery_float_order_chat",
  fab_delivery_home: "store_delivery_fab_home",
};

export function mainBottomNavFabItemLabelKey(
  item: Pick<MainBottomNavFabDisplayItem | MainBottomNavFabStoredItem, "id" | "href">
): MessageKey | null {
  const byId = FAB_ITEM_LABEL_KEY_BY_ID[item.id];
  if (byId) return byId;
  if (isMainBottomNavFabStoreAdminItem(item)) return "store_delivery_fab_store";
  return null;
}

/** 런타임 FAB 캡션 — DB·기본값 한글과 무관하게 catalog 라벨 사용 */
export function localizeMainBottomNavFabDisplayItems(
  items: readonly MainBottomNavFabDisplayItem[],
  t: (key: MessageKey) => string
): MainBottomNavFabDisplayItem[] {
  return items.map((item) => {
    const key = mainBottomNavFabItemLabelKey(item);
    return key ? { ...item, label: t(key) } : item;
  });
}

/** 어드민 「배달 기본값 채우기」 — 저장 시점 i18n 라벨 */
export function buildLocalizedDefaultDeliveryFabConfig(
  t: (key: MessageKey) => string
): MainBottomNavFabStoredConfig {
  const storeAdmin = createMainBottomNavFabStoreAdminItem();
  const items: MainBottomNavFabStoredItem[] = [
    { ...storeAdmin, label: t("store_delivery_fab_store") },
    {
      id: "fab_delivery_orders",
      visible: true,
      label: t("store_delivery_float_order_history"),
      href: "/orders",
      icon: "orders",
    },
    {
      id: "fab_delivery_cart",
      visible: true,
      label: t("store_delivery_fab_cart"),
      href: "/stores/cart",
      icon: "cart",
    },
    {
      id: "fab_delivery_order_chat",
      visible: true,
      label: t("store_delivery_float_order_chat"),
      href: mainBottomNavMessengerTabHref("delivery"),
      icon: "chat",
    },
    {
      id: "fab_delivery_home",
      visible: true,
      label: t("store_delivery_fab_home"),
      href: "/stores",
      icon: "home",
    },
  ];
  return { enabled: true, items };
}
