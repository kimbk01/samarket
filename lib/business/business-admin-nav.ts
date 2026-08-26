import type { MessageKey } from "@/lib/i18n/messages";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav";
import { OwnerRoutes } from "@/lib/business/owner-routes";

export type BusinessAdminNavItemId =
  | "dashboard"
  | "basic_info"
  | "store_settings"
  | "inquiries"
  | "delivery_orders"
  | "delivery_ops"
  | "products"
  | "categories"
  | "banners"
  | "coupons"
  | "gift_certificates"
  | "notices"
  | "ops_review"
  | "public_store"
  | "settlements"
  | "store_points"
  | "ads"
  | "notifications";

export type BusinessAdminSidebarItemDef = {
  id: BusinessAdminNavItemId;
  labelKey: MessageKey;
  href: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
  descriptionKey?: MessageKey;
};

export type BusinessAdminSidebarSectionDef = {
  titleKey: MessageKey;
  items: BusinessAdminSidebarItemDef[];
};

export type BusinessAdminSidebarItem = {
  id: BusinessAdminNavItemId;
  label: string;
  href: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
  description?: string;
};

export type BusinessAdminSidebarSection = {
  title: string;
  items: BusinessAdminSidebarItem[];
};

type TranslateFn = (key: MessageKey) => string;

export function resolveBusinessAdminSidebar(
  defs: BusinessAdminSidebarSectionDef[],
  t: TranslateFn
): BusinessAdminSidebarSection[] {
  return defs.map((section) => ({
    title: t(section.titleKey),
    items: section.items.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      href: item.href,
      badge: item.badge,
      disabled: item.disabled,
      hint: item.hint,
      description: item.descriptionKey ? t(item.descriptionKey) : undefined,
    })),
  }));
}

/** 허브 메뉴·사이드바 공통 — 활성 행 판별 */
export function isBusinessAdminNavHrefActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const [path, rawQ = ""] = href.split("?");
  const norm = (v: string) => v.replace(/\/+$/, "") || "/";
  const targetPath = norm(path);
  const currentPath = norm(pathname);

  const isHubPath = (p: string) =>
    p === "/stores/owner" || p === "/my/business" || p === "/mypage/business";
  const pathsMatch =
    targetPath === currentPath || (isHubPath(targetPath) && isHubPath(currentPath));

  if (!pathsMatch) return false;

  const tq = new URLSearchParams(rawQ);
  const tSid = tq.get("storeId");
  if (tSid) {
    return searchParams.get("storeId") === tSid;
  }
  return true;
}

/**
 * 매장 어드민 좌측 네비 — `buildMyBusinessNavGroups`와 동일한 노출 조건을 유지합니다.
 */
export function buildBusinessAdminSidebar(ctx: MyBusinessNavContext): BusinessAdminSidebarSectionDef[] {
  const { storeId, slug, approvalStatus, isVisible, canSell, orderAlertsBadge } = ctx;
  const approved = approvalStatus === "approved";
  const showOps = approved && isVisible;

  const sections: BusinessAdminSidebarSectionDef[] = [];

  const opsItems: BusinessAdminSidebarItemDef[] = [
    {
      id: "dashboard",
      labelKey: "biz_nav_dashboard",
      href: OwnerRoutes.hub(storeId),
      descriptionKey: "biz_nav_dashboard_desc",
    },
    {
      id: "basic_info",
      labelKey: "biz_nav_basic_info",
      href: OwnerRoutes.basicInfo(storeId),
      descriptionKey: "biz_nav_basic_info_desc",
    },
    {
      id: "store_settings",
      labelKey: "biz_nav_store_settings",
      href: OwnerRoutes.profile(storeId),
      descriptionKey: "biz_nav_store_settings_desc",
    },
  ];
  if (showOps) {
    opsItems.push({
      id: "inquiries",
      labelKey: "biz_nav_inquiries",
      href: OwnerRoutes.inquiries(storeId),
      descriptionKey: "biz_nav_inquiries_desc",
    });
  }
  sections.push({ titleKey: "biz_nav_section_ops", items: opsItems });

  if (approved) {
    const deliveryItems: BusinessAdminSidebarItemDef[] = [];
    if (showOps && canSell) {
      deliveryItems.push({
        id: "delivery_orders",
        labelKey: "biz_nav_delivery_orders",
        href: OwnerRoutes.orders(storeId),
        badge: orderAlertsBadge > 0 ? orderAlertsBadge : undefined,
        descriptionKey: "biz_nav_delivery_orders_desc",
      });
    }
    deliveryItems.push({
      id: "delivery_ops",
      labelKey: "biz_nav_delivery_ops",
      href: OwnerRoutes.opsStatus(storeId),
      descriptionKey: "biz_nav_delivery_ops_desc",
    });
    sections.push({ titleKey: "biz_nav_section_delivery", items: deliveryItems });
  }

  if (approved) {
    sections.push({
      titleKey: "biz_nav_section_products",
      items: [
        {
          id: "products",
          labelKey: "biz_nav_products",
          href: OwnerRoutes.products(storeId),
          descriptionKey: "biz_nav_products_desc",
        },
        {
          id: "categories",
          labelKey: "biz_nav_categories",
          href: OwnerRoutes.menuCategories(storeId),
        },
        {
          id: "banners",
          labelKey: "biz_nav_banners",
          href: OwnerRoutes.banners(storeId),
          descriptionKey: "biz_nav_banners_desc",
        },
        {
          id: "coupons",
          labelKey: "biz_nav_coupons",
          href: OwnerRoutes.coupons(storeId),
          descriptionKey: "biz_nav_coupons_desc",
        },
        {
          id: "gift_certificates",
          labelKey: "biz_nav_gift_certificates",
          href: OwnerRoutes.giftCertificates(storeId),
          descriptionKey: "biz_nav_gift_certificates_desc",
        },
        {
          id: "notices",
          labelKey: "biz_nav_notices",
          href: OwnerRoutes.notices(storeId),
          descriptionKey: "biz_nav_notices_desc",
        },
      ],
    });
  }

  const storeItems: BusinessAdminSidebarItemDef[] = [
    {
      id: "ops_review",
      labelKey: "biz_nav_ops_review",
      href: OwnerRoutes.opsStatus(storeId),
    },
  ];
  if (approved && isVisible && slug) {
    storeItems.push({
      id: "public_store",
      labelKey: "biz_nav_public_store",
      href: `/stores/${encodeURIComponent(slug)}`,
      descriptionKey: "biz_nav_public_store_desc",
    });
  }
  sections.push({ titleKey: "biz_nav_section_store", items: storeItems });

  if (showOps) {
    sections.push({
      titleKey: "biz_nav_section_settlement",
      items: [
        {
          id: "store_points",
          labelKey: "biz_nav_store_points",
          href: OwnerRoutes.points(storeId),
          descriptionKey: "biz_nav_store_points_desc",
        },
        {
          id: "settlements",
          labelKey: "biz_nav_settlements",
          href: OwnerRoutes.settlements(storeId),
        },
      ],
    });
  }

  sections.push({
    titleKey: "biz_nav_section_growth",
    items: [
      {
        id: "ads",
        labelKey: "biz_nav_ads",
        href: "/my/ads",
        descriptionKey: "biz_nav_ads_desc",
      },
    ],
  });

  sections.push({
    titleKey: "biz_nav_section_settings",
    items: [
      {
        id: "notifications",
        labelKey: "biz_nav_notifications",
        href: OwnerRoutes.settings(storeId),
        descriptionKey: "biz_nav_notifications_desc",
      },
    ],
  });

  return sections.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.disabled),
  }));
}
