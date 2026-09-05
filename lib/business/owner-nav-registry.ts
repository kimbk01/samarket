/**
 * Owner Admin navigation registry — SINGLE authority for:
 * - bottom primary tabs
 * - drawer / sidebar sections
 * - customer hub entries
 * - legacy my-business nav groups (derived)
 *
 * DO NOT duplicate nav arrays in components.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav-types";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav-ids";

export type OwnerNavDomain =
  | "home"
  | "orders"
  | "products"
  | "customers"
  | "manage"
  | "finance"
  | "growth"
  | "system";

export type OwnerNavSurface = "bottom" | "drawer" | "customer_hub" | "manage_hub";

export type OwnerBottomNavTabId = "home" | "orders" | "products" | "customers" | "manage";

export type OwnerNavEntryDef = {
  id: BusinessAdminNavItemId | "order_chats" | "customer_center";
  domain: OwnerNavDomain;
  labelKey: MessageKey;
  descriptionKey?: MessageKey;
  href: (storeId: string, slug?: string | null) => string;
  /** When true, show only if approved && visible (ops). */
  requireShowOps?: boolean;
  /** When true, show only if approved. */
  requireApproved?: boolean;
  /** When true, show only if canSell. */
  requireCanSell?: boolean;
  /** When true, require slug + visible for public store link. */
  requirePublicSlug?: boolean;
  surfaces: OwnerNavSurface[];
  /** Drawer section key */
  drawerSection?:
    | "ops"
    | "products"
    | "store"
    | "finance"
    | "growth"
    | "system";
  badgeFrom?: "order_alerts";
};

export type OwnerBottomNavItemDef = {
  id: OwnerBottomNavTabId;
  labelKey: MessageKey;
  href: (storeId: string) => string;
};

/** Primary bottom nav — 홈 · 주문 · 상품 · 고객 · 관리 */
export const OWNER_BOTTOM_NAV_PRIMARY: readonly OwnerBottomNavItemDef[] = [
  {
    id: "home",
    labelKey: "store_owner_bottom_nav_home",
    href: (id) => OwnerRoutes.hub(id),
  },
  {
    id: "orders",
    labelKey: "store_owner_bottom_nav_orders",
    href: (id) => OwnerRoutes.orders(id),
  },
  {
    id: "products",
    labelKey: "store_owner_bottom_nav_products",
    href: (id) => OwnerRoutes.products(id),
  },
  {
    id: "customers",
    labelKey: "store_owner_bottom_nav_customers",
    href: (id) => OwnerRoutes.customerCare(id),
  },
  {
    id: "manage",
    labelKey: "store_owner_bottom_nav_manage",
    href: (id) => OwnerRoutes.settings(id),
  },
] as const;

/**
 * Left · Home(center) · Right layout for delivery-style orbit home.
 * LEFT: 주문 · 상품 · CENTER: 홈 · RIGHT: 고객 · 관리
 */
export const OWNER_BOTTOM_NAV_SIDE_LEFT_IDS: readonly OwnerBottomNavTabId[] = [
  "orders",
  "products",
] as const;

export const OWNER_BOTTOM_NAV_SIDE_RIGHT_IDS: readonly OwnerBottomNavTabId[] = [
  "customers",
  "manage",
] as const;

export function getOwnerBottomNavItemDef(id: OwnerBottomNavTabId): OwnerBottomNavItemDef {
  const found = OWNER_BOTTOM_NAV_PRIMARY.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown owner bottom nav tab: ${id}`);
  return found;
}

/** Full drawer registry entries (canonical routes only). */
export const OWNER_NAV_REGISTRY: readonly OwnerNavEntryDef[] = [
  {
    id: "dashboard",
    domain: "home",
    labelKey: "biz_nav_dashboard",
    descriptionKey: "biz_nav_dashboard_desc",
    href: (storeId) => OwnerRoutes.hub(storeId),
    surfaces: ["drawer"],
    drawerSection: "ops",
  },
  {
    id: "delivery_orders",
    domain: "orders",
    labelKey: "biz_nav_delivery_orders",
    descriptionKey: "biz_nav_delivery_orders_desc",
    href: (storeId) => OwnerRoutes.orders(storeId),
    requireShowOps: true,
    requireCanSell: true,
    surfaces: ["drawer"],
    drawerSection: "ops",
    badgeFrom: "order_alerts",
  },
  {
    id: "customer_care",
    domain: "customers",
    labelKey: "biz_nav_customer_care",
    descriptionKey: "biz_nav_customer_care_desc",
    href: (storeId) => OwnerRoutes.customerCare(storeId),
    requireShowOps: true,
    surfaces: ["drawer", "customer_hub"],
    drawerSection: "ops",
  },
  {
    id: "order_chats",
    domain: "customers",
    labelKey: "biz_care_order_chat",
    descriptionKey: "biz_care_order_chat_desc",
    href: (storeId) => OwnerRoutes.orderChats(storeId),
    requireShowOps: true,
    surfaces: ["customer_hub"],
  },
  {
    id: "inquiries",
    domain: "customers",
    labelKey: "biz_nav_store_inquiries",
    descriptionKey: "biz_nav_inquiries_desc",
    href: (storeId) => OwnerRoutes.inquiries(storeId),
    requireShowOps: true,
    surfaces: ["drawer", "customer_hub"],
    drawerSection: "ops",
  },
  {
    id: "reviews",
    domain: "customers",
    labelKey: "my_biz_reviews",
    href: (storeId) => OwnerRoutes.reviews(storeId),
    requireApproved: true,
    surfaces: ["drawer", "customer_hub"],
    drawerSection: "ops",
  },
  {
    id: "customer_center",
    domain: "customers",
    labelKey: "biz_care_customer_center",
    descriptionKey: "biz_care_customer_center_desc",
    href: (storeId) => {
      const base = OwnerRoutes.customerCareCenter(storeId);
      return `${base}${base.includes("?") ? "&" : "?"}from=owner-care`;
    },
    requireShowOps: true,
    surfaces: ["customer_hub"],
  },
  {
    id: "products",
    domain: "products",
    labelKey: "biz_nav_products",
    descriptionKey: "biz_nav_products_desc",
    href: (storeId) => OwnerRoutes.products(storeId),
    requireApproved: true,
    surfaces: ["drawer"],
    drawerSection: "products",
  },
  {
    id: "categories",
    domain: "products",
    labelKey: "biz_nav_categories",
    href: (storeId) => OwnerRoutes.menuCategories(storeId),
    requireApproved: true,
    surfaces: ["drawer"],
    drawerSection: "products",
  },
  {
    id: "coupons",
    domain: "products",
    labelKey: "biz_nav_coupons",
    descriptionKey: "biz_nav_coupons_desc",
    href: (storeId) => OwnerRoutes.coupons(storeId),
    requireApproved: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "products",
  },
  {
    id: "gift_certificates",
    domain: "products",
    labelKey: "biz_nav_gift_certificates",
    descriptionKey: "biz_nav_gift_certificates_desc",
    href: (storeId) => OwnerRoutes.giftCertificates(storeId),
    requireApproved: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "products",
  },
  {
    id: "banners",
    domain: "products",
    labelKey: "biz_nav_banners",
    descriptionKey: "biz_nav_banners_desc",
    href: (storeId) => OwnerRoutes.banners(storeId),
    requireApproved: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "products",
  },
  {
    id: "notices",
    domain: "products",
    labelKey: "biz_nav_notices",
    descriptionKey: "biz_nav_notices_desc",
    href: (storeId) => OwnerRoutes.notices(storeId),
    requireApproved: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "products",
  },
  {
    id: "basic_info",
    domain: "manage",
    labelKey: "biz_nav_basic_info",
    descriptionKey: "biz_nav_basic_info_desc",
    href: (storeId) => OwnerRoutes.basicInfo(storeId),
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "store",
  },
  {
    id: "store_settings",
    domain: "manage",
    labelKey: "biz_nav_store_settings",
    descriptionKey: "biz_nav_store_settings_desc",
    href: (storeId) => OwnerRoutes.profile(storeId),
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "store",
  },
  /** Single ops-status entry — collapses former delivery_ops + ops_review duplicate. */
  {
    id: "delivery_ops",
    domain: "manage",
    labelKey: "biz_nav_delivery_ops",
    descriptionKey: "biz_nav_delivery_ops_desc",
    href: (storeId) => OwnerRoutes.opsStatus(storeId),
    requireApproved: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "store",
  },
  {
    id: "public_store",
    domain: "manage",
    labelKey: "biz_nav_public_store",
    descriptionKey: "biz_nav_public_store_desc",
    href: (_storeId, slug) => `/stores/${encodeURIComponent(slug ?? "")}`,
    requirePublicSlug: true,
    surfaces: ["drawer"],
    drawerSection: "store",
  },
  {
    id: "finance",
    domain: "finance",
    labelKey: "biz_nav_finance",
    descriptionKey: "biz_nav_finance_desc",
    href: (storeId) => OwnerRoutes.finance(storeId),
    requireShowOps: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "finance",
  },
  {
    id: "settlements",
    domain: "finance",
    labelKey: "biz_nav_settlements",
    href: (storeId) => OwnerRoutes.settlements(storeId),
    requireShowOps: true,
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "finance",
  },
  {
    id: "ads",
    domain: "growth",
    labelKey: "biz_nav_ads",
    descriptionKey: "biz_nav_ads_desc",
    href: (storeId) => OwnerRoutes.ads(storeId),
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "growth",
  },
  {
    id: "notifications",
    domain: "system",
    labelKey: "biz_nav_notifications",
    descriptionKey: "biz_nav_notifications_desc",
    href: (storeId) => OwnerRoutes.settings(storeId),
    surfaces: ["drawer", "manage_hub"],
    drawerSection: "system",
  },
] as const;

const DRAWER_SECTION_META: {
  id: NonNullable<OwnerNavEntryDef["drawerSection"]>;
  titleKey: MessageKey;
}[] = [
  { id: "ops", titleKey: "biz_nav_section_ops" },
  { id: "products", titleKey: "biz_nav_section_products" },
  { id: "store", titleKey: "biz_nav_section_store" },
  { id: "finance", titleKey: "biz_nav_section_settlement" },
  { id: "growth", titleKey: "biz_nav_section_growth" },
  { id: "system", titleKey: "biz_nav_section_settings" },
];

function entryVisible(entry: OwnerNavEntryDef, ctx: MyBusinessNavContext): boolean {
  const approved = ctx.approvalStatus === "approved";
  const showOps = approved && ctx.isVisible;
  if (entry.requireApproved && !approved) return false;
  if (entry.requireShowOps && !showOps) return false;
  if (entry.requireCanSell && !ctx.canSell) return false;
  if (entry.requirePublicSlug) {
    if (!(approved && ctx.isVisible && ctx.slug)) return false;
  }
  return true;
}

/** Derive drawer/sidebar sections from the registry (ONE authority). */
export function buildOwnerDrawerSectionsFromRegistry(ctx: MyBusinessNavContext): {
  titleKey: MessageKey;
  items: {
    id: BusinessAdminNavItemId;
    labelKey: MessageKey;
    href: string;
    descriptionKey?: MessageKey;
    badge?: number;
    disabled?: boolean;
  }[];
}[] {
  const sections: {
    titleKey: MessageKey;
    items: {
      id: BusinessAdminNavItemId;
      labelKey: MessageKey;
      href: string;
      descriptionKey?: MessageKey;
      badge?: number;
      disabled?: boolean;
    }[];
  }[] = [];

  for (const meta of DRAWER_SECTION_META) {
    const items = OWNER_NAV_REGISTRY.filter(
      (e) =>
        e.surfaces.includes("drawer") &&
        e.drawerSection === meta.id &&
        entryVisible(e, ctx) &&
        e.id !== "order_chats" &&
        e.id !== "customer_center"
    ).map((e) => {
      const href =
        e.id === "public_store" ? e.href(ctx.storeId, ctx.slug) : e.href(ctx.storeId);
      const item: {
        id: BusinessAdminNavItemId;
        labelKey: MessageKey;
        href: string;
        descriptionKey?: MessageKey;
        badge?: number;
      } = {
        id: e.id as BusinessAdminNavItemId,
        labelKey: e.labelKey,
        href,
        descriptionKey: e.descriptionKey,
      };
      if (e.badgeFrom === "order_alerts" && ctx.orderAlertsBadge > 0) {
        item.badge = ctx.orderAlertsBadge;
      }
      return item;
    });
    if (items.length > 0) {
      sections.push({ titleKey: meta.titleKey, items });
    }
  }

  return sections;
}

/** Manage tab hub — registry-driven sections (store / promo / finance / growth / system). */
export function buildOwnerManageHubSectionsFromRegistry(ctx: MyBusinessNavContext): {
  titleKey: MessageKey;
  items: {
    id: BusinessAdminNavItemId;
    labelKey: MessageKey;
    href: string;
    descriptionKey?: MessageKey;
  }[];
}[] {
  return buildOwnerDrawerSectionsFromRegistry(ctx)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const def = OWNER_NAV_REGISTRY.find((e) => e.id === item.id);
        return def?.surfaces.includes("manage_hub");
      }),
    }))
    .filter((section) => section.items.length > 0);
}

export type OwnerCustomerHubEntryId =
  | "order-chat"
  | "store-inquiry"
  | "reviews"
  | "customer-center";

/** Customer hub — STORE↔CUSTOMER vs OWNER↔DIBAY stay separate entries. */
export function listOwnerCustomerHubEntries(storeId: string | null | undefined): {
  id: OwnerCustomerHubEntryId;
  href: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  audience: "store_customer" | "dibay_support";
}[] {
  const sid = (storeId ?? "").trim() || null;
  return [
    {
      id: "order-chat",
      href: OwnerRoutes.orderChats(sid),
      titleKey: "biz_care_order_chat",
      descKey: "biz_care_order_chat_desc",
      audience: "store_customer",
    },
    {
      id: "store-inquiry",
      href: OwnerRoutes.inquiries(sid),
      titleKey: "biz_care_store_inquiry",
      descKey: "biz_care_store_inquiry_desc",
      audience: "store_customer",
    },
    {
      id: "reviews",
      href: OwnerRoutes.reviews(sid),
      titleKey: "my_biz_reviews",
      descKey: "biz_care_reviews_desc",
      audience: "store_customer",
    },
    {
      id: "customer-center",
      href: (() => {
        const base = OwnerRoutes.customerCareCenter(sid);
        return `${base}${base.includes("?") ? "&" : "?"}from=owner-care`;
      })(),
      titleKey: "biz_care_customer_center",
      descKey: "biz_care_customer_center_desc",
      audience: "dibay_support",
    },
  ];
}
