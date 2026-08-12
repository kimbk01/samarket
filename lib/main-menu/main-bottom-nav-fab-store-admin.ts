import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type {
  MainBottomNavFabDisplayItem,
  MainBottomNavFabStoredItem,
} from "@/lib/main-menu/main-bottom-nav-fab-types";
import {
  readOwnerActiveStoreIdFromSession,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";

/** 배달 FAB — 매장 어드민(승인 매장주 전용) */
export const MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID = "fab_delivery_store_admin";

export const MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_HREF = "/stores/owner";

export function isMainBottomNavFabStoreAdminItem(
  item: Pick<MainBottomNavFabStoredItem | MainBottomNavFabDisplayItem, "id" | "href">
): boolean {
  if (item.id === MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID) return true;
  const href = (item.href ?? "").split("?")[0]?.trim().replace(/\/+$/, "") ?? "";
  return href === MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_HREF;
}

export function createMainBottomNavFabStoreAdminItem(label = ""): MainBottomNavFabStoredItem {
  return {
    id: MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID,
    visible: true,
    label,
    href: MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_HREF,
    icon: "owner_hub",
  };
}

/** Approved-list helper — MODEL A (session preferred → newest sellable fallback). */
export function pickApprovedOwnerStoreForFab(stores: readonly StoreRow[]): StoreRow | null {
  const approved = stores.filter((store) => String(store.approval_status) === "approved");
  return (
    resolveOwnerActiveStoreRow(approved, {
      preferredStoreId: readOwnerActiveStoreIdFromSession(),
    }) ?? null
  );
}

export function resolveStoreAdminFabHref(storeId: string | null | undefined): string {
  return OwnerRoutes.hub(storeId);
}

/** 승인 매장이 있을 때만 매장 어드민 FAB 노출 + hub URL 보정 */
export function applyMainBottomNavFabStoreAdminGate(
  items: readonly MainBottomNavFabDisplayItem[],
  approvedStore: StoreRow | null
): MainBottomNavFabDisplayItem[] {
  const storeId = approvedStore?.id?.trim() ?? "";
  return items
    .filter((item) => {
      if (!isMainBottomNavFabStoreAdminItem(item)) return true;
      return Boolean(storeId);
    })
    .map((item) => {
      if (!isMainBottomNavFabStoreAdminItem(item) || !storeId) return item;
      return {
        ...item,
        href: resolveStoreAdminFabHref(storeId),
      };
    });
}

/**
 * DB에 예전 FAB(3~4개)만 저장된 경우에도 승인 매장주에게 매장 어드민 항목을 보장한다.
 * (어드민에서 「매장 어드민 FAB 추가」 없이도 앱에 노출)
 */
export function ensureStoreAdminFabItemForApprovedOwner(
  items: readonly MainBottomNavFabDisplayItem[],
  approvedStore: StoreRow | null
): MainBottomNavFabDisplayItem[] {
  const gated = applyMainBottomNavFabStoreAdminGate(items, approvedStore);
  const storeId = approvedStore?.id?.trim() ?? "";
  if (!storeId) return gated;
  if (gated.some(isMainBottomNavFabStoreAdminItem)) return gated;

  const adminItem: MainBottomNavFabDisplayItem = {
    id: MAIN_BOTTOM_NAV_FAB_STORE_ADMIN_ITEM_ID,
    label: "",
    href: resolveStoreAdminFabHref(storeId),
    icon: "owner_hub",
  };
  return [adminItem, ...gated];
}
