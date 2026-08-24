/**
 * Delivery product CMS — mockup IA (HOME / Category / Ads / Coupons / Promo).
 * Existing platform workspace tabs stay; this drives Delivery sidebar + CMS subnav.
 */

export type DeliveryCmsNavItem = {
  key: string;
  labelKo: string;
  labelEn: string;
  href: string;
  match: (path: string, search: string) => boolean;
};

export type DeliveryCmsSidebarNode = {
  key: string;
  labelKo: string;
  labelEn: string;
  href?: string;
  match?: (path: string, search: string) => boolean;
  children?: DeliveryCmsSidebarNode[];
  help?: boolean;
};

/** Mockup top strip inside Delivery CMS surfaces */
export const DELIVERY_CMS_TOP_NAV: DeliveryCmsNavItem[] = [
  {
    key: "home",
    labelKo: "HOME",
    labelEn: "HOME",
    href: "/admin",
    match: (p) => p === "/admin" || p === "/admin/",
  },
  {
    key: "delivery",
    labelKo: "배달",
    labelEn: "Delivery",
    href: "/admin/stores-home-shelves",
    match: (p) =>
      p.startsWith("/admin/stores-home-shelves") ||
      p.startsWith("/admin/stores-category-policy") ||
      p.startsWith("/admin/store-insertions") ||
      p.startsWith("/admin/store-discovery") ||
      p.startsWith("/admin/business") ||
      p.startsWith("/admin/stores"),
  },
  {
    key: "orders",
    labelKo: "주문",
    labelEn: "Orders",
    href: "/admin/stores/orders",
    match: (p) => p.startsWith("/admin/stores/orders") || p.startsWith("/admin/delivery-orders"),
  },
  {
    key: "products",
    labelKo: "상품",
    labelEn: "Products",
    href: "/admin/store-products",
    match: (p) => p.startsWith("/admin/store-products"),
  },
  {
    key: "ads_coupons",
    labelKo: "광고/쿠폰",
    labelEn: "Ads / Coupons",
    href: "/admin/store-insertions",
    match: (p) => p.startsWith("/admin/store-insertions"),
  },
  {
    key: "settlement",
    labelKo: "정산",
    labelEn: "Settlement",
    href: "/admin/store-settlements",
    match: (p) => p.startsWith("/admin/store-settlements"),
  },
  {
    key: "ops",
    labelKo: "운영",
    labelEn: "Ops",
    href: "/admin/ops-console",
    match: (p) => p.startsWith("/admin/ops-console") || p.startsWith("/admin/ops-stats"),
  },
  {
    key: "customer",
    labelKo: "고객관리",
    labelEn: "Customers",
    href: "/admin/store-reports",
    match: (p) => p.startsWith("/admin/store-reports") || p.startsWith("/admin/store-reviews"),
  },
  {
    key: "system",
    labelKo: "시스템",
    labelEn: "System",
    href: "/admin/delivery-runtime-health",
    match: (p) =>
      p.startsWith("/admin/delivery-runtime-health") || p.startsWith("/admin/delivery-release-gate"),
  },
];

export const DELIVERY_CMS_SIDEBAR: DeliveryCmsSidebarNode[] = [
  {
    key: "home_mgmt",
    labelKo: "HOME 관리",
    labelEn: "HOME management",
    href: "/admin/stores-home-shelves",
    match: (p) => p.startsWith("/admin/stores-home-shelves"),
  },
  {
    key: "category_mgmt",
    labelKo: "카테고리 관리",
    labelEn: "Category management",
    match: (p) => p.startsWith("/admin/stores-category-policy"),
    children: [
      {
        key: "primary",
        labelKo: "1차 업종",
        labelEn: "Primary",
        href: "/admin/stores-category-policy?tier=primary",
        match: (p, s) =>
          p.startsWith("/admin/stores-category-policy") &&
          (s.includes("tier=primary") || (!s.includes("tier=secondary") && !s.includes("tier="))),
      },
      {
        key: "secondary",
        labelKo: "2차 업종",
        labelEn: "Secondary",
        href: "/admin/stores-category-policy?tier=secondary",
        match: (p, s) => p.startsWith("/admin/stores-category-policy") && s.includes("tier=secondary"),
      },
    ],
  },
  {
    key: "ads",
    labelKo: "광고 관리",
    labelEn: "Ad management",
    href: "/admin/store-insertions?focus=ads",
    match: (p, s) => p.startsWith("/admin/store-insertions") && (s.includes("focus=ads") || !s.includes("focus=")),
  },
  {
    key: "coupons",
    labelKo: "쿠폰 관리",
    labelEn: "Coupon management",
    href: "/admin/store-insertions?focus=coupons",
    match: (p, s) => p.startsWith("/admin/store-insertions") && s.includes("focus=coupons"),
  },
  {
    key: "promo",
    labelKo: "프로모션 관리",
    labelEn: "Promotion management",
    href: "/admin/store-discovery",
    match: (p) => p.startsWith("/admin/store-discovery"),
  },
];

export const DELIVERY_CMS_HELP_HOME: DeliveryCmsSidebarNode[] = [
  { key: "help_home", labelKo: "HOME 선반 가이드", labelEn: "HOME shelf guide", help: true },
  { key: "help_cat", labelKo: "카테고리 운영 가이드", labelEn: "Category ops guide", help: true },
  { key: "help_ad", labelKo: "광고/쿠폰 가이드", labelEn: "Ads/coupons guide", help: true },
];

export const DELIVERY_CMS_HELP_CATEGORY: DeliveryCmsSidebarNode[] = [
  { key: "help_policy", labelKo: "카테고리 정책 가이드", labelEn: "Category policy guide", help: true },
  { key: "help_tier", labelKo: "1·2차 업종 가이드", labelEn: "Primary/secondary guide", help: true },
  { key: "help_inherit", labelKo: "상속/개별 설정 가이드", labelEn: "Inherit/custom guide", help: true },
];

export function isDeliveryCmsSurface(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/stores-home-shelves") ||
    pathname.startsWith("/admin/stores-category-policy") ||
    pathname.startsWith("/admin/store-insertions") ||
    pathname.startsWith("/admin/store-discovery")
  );
}
