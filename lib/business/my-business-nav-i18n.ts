import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type {
  MyBusinessNavContext,
  MyBusinessNavGroup,
  MyBusinessNavIcon,
  MyBusinessNavItem,
} from "@/lib/business/my-business-nav-types";

function bizT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

function item(
  labelKey: MessageKey,
  icon: MyBusinessNavIcon,
  rest: Omit<MyBusinessNavItem, "label" | "icon">
): MyBusinessNavItem {
  return { label: bizT(labelKey), icon, ...rest };
}

export function buildMyBusinessNavGroups(ctx: MyBusinessNavContext): MyBusinessNavGroup[] {
  const { storeId, slug, approvalStatus, isVisible, canSell, orderAlertsBadge } = ctx;
  const approved = approvalStatus === "approved";
  const showOps = approved && isVisible;

  const groups: MyBusinessNavGroup[] = [];

  const storeLinks: MyBusinessNavItem[] = [
    item("biz_nav_basic_info", "identity", { href: OwnerRoutes.basicInfo(storeId) }),
    item("biz_nav_store_settings", "building", { href: OwnerRoutes.profile(storeId) }),
    item("my_biz_ops_status", "ops_status", { href: OwnerRoutes.opsStatus(storeId) }),
  ];
  if (approved && isVisible && slug) {
    storeLinks.push(
      item("biz_nav_public_store", "external", {
        href: `/stores/${encodeURIComponent(slug)}`,
        hint: bizT("my_biz_public_hint"),
      })
    );
  }
  groups.push({ title: bizT("my_biz_group_store"), items: storeLinks });

  const orderItems: MyBusinessNavItem[] = [];
  if (showOps && canSell) {
    orderItems.push(
      item("my_biz_orders_manage", "orders", {
        href: OwnerRoutes.orders(storeId),
        badge: orderAlertsBadge > 0 ? orderAlertsBadge : undefined,
      })
    );
  }
  if (showOps) {
    orderItems.push(
      item("my_biz_inquiries_received", "inquiry", { href: OwnerRoutes.inquiries(storeId) }),
      item("biz_nav_settlements", "settlement", { href: OwnerRoutes.settlements(storeId) })
    );
  }
  if (orderItems.length > 0) {
    groups.push({ title: bizT("my_biz_group_orders"), items: orderItems });
  }

  const menuItems: MyBusinessNavItem[] = [];
  if (approved) {
    menuItems.push(
      item("biz_nav_categories", "category", { href: OwnerRoutes.menuCategories(storeId) }),
      item("biz_nav_products", "product", { href: OwnerRoutes.products(storeId) })
    );
  }
  if (menuItems.length > 0) {
    groups.push({ title: bizT("my_biz_group_products"), items: menuItems });
  }

  const extra: MyBusinessNavItem[] = [
    item("my_biz_staff", "staff", { disabled: true, hint: bizT("my_biz_staff_hint") }),
    item("my_biz_reviews", "review", { href: OwnerRoutes.reviews(storeId) }),
    item("biz_nav_ads", "promo", { href: "/my/ads", hint: bizT("my_biz_ads_hint") }),
  ];
  if (approved) {
    extra.unshift(
      item("biz_nav_notifications", "settings", {
        href: OwnerRoutes.settings(storeId),
        hint: bizT("my_biz_notif_hint"),
      })
    );
  }
  groups.push({ title: bizT("my_biz_group_extra"), items: extra });

  return groups.filter((g) => g.items.length > 0);
}
