import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  MyBusinessNavContext,
  MyBusinessNavGroup,
  MyBusinessNavIcon,
  MyBusinessNavItem,
} from "@/lib/business/my-business-nav-types";
import { buildOwnerDrawerSectionsFromRegistry } from "@/lib/business/owner-nav-registry";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav-ids";

function bizT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const ICON_BY_NAV_ID: Partial<Record<BusinessAdminNavItemId, MyBusinessNavIcon>> = {
  dashboard: "ops_status",
  basic_info: "identity",
  store_settings: "building",
  delivery_ops: "ops_status",
  public_store: "external",
  delivery_orders: "orders",
  inquiries: "inquiry",
  customer_care: "inquiry",
  order_chats: "inquiry",
  customer_center: "inquiry",
  reviews: "review",
  settlements: "settlement",
  finance: "settlement",
  products: "product",
  product_new: "product",
  categories: "category",
  banners: "menu_board",
  coupons: "promo",
  gift_certificates: "promo",
  notices: "menu_board",
  ads: "promo",
  notifications: "settings",
};

/**
 * Legacy hub/card menu groups — derived from OwnerNavRegistry (same href/gate authority).
 * Icon mapping is presentation-only for MyBusinessNavList consumers.
 */
export function buildMyBusinessNavGroups(ctx: MyBusinessNavContext): MyBusinessNavGroup[] {
  const sections = buildOwnerDrawerSectionsFromRegistry(ctx);
  return sections
    .map((section) => {
      const items: MyBusinessNavItem[] = section.items.map((item) => ({
        label: bizT(item.labelKey),
        icon: ICON_BY_NAV_ID[item.id] ?? "settings",
        href: item.href,
        badge: item.badge,
        disabled: item.disabled,
        hint: item.descriptionKey ? bizT(item.descriptionKey) : undefined,
      }));
      return {
        title: bizT(section.titleKey),
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}
