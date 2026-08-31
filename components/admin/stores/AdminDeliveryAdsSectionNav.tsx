"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

const NAV_ITEMS = [
  {
    href: DELIVERY_AD_ADMIN_ROUTES.hub,
    match: (p: string) =>
      p === DELIVERY_AD_ADMIN_ROUTES.hub ||
      /^\/admin\/delivery-ads\/[0-9a-f-]{8,}/i.test(p),
    labelKo: "광고 목록",
    labelEn: "Ad list",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.inventory,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.inventory),
    labelKo: "광고 지면 관리",
    labelEn: "Ad placements",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.commercialSettings,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.commercialSettings),
    labelKo: "광고 상품·가격",
    labelEn: "Products & prices",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.partnerMemberships,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.partnerMemberships),
    labelKo: "Partner 관리",
    labelEn: "Partner",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.firstPartyNew,
    match: (p: string) => p.startsWith("/admin/delivery-ads/first-party"),
    labelKo: "디바이 광고 만들기",
    labelEn: "Create DIBAY ad",
  },
] as const;

/**
 * Primary Admin Delivery Ads navigation — tabs/action bar, not underline text links.
 */
export function AdminDeliveryAdsSectionNav() {
  const pathname = usePathname() || "";
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";

  return (
    <nav
      className="mb-4 flex flex-wrap gap-2"
      data-admin-delivery-ads-section-nav="1"
      aria-label={safeT("admin_delivery_ads_section_nav_aria", {
        fallbackKo: "배달 광고 관리 메뉴",
        fallbackEn: "Delivery ads admin menu",
      })}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-h-[40px] items-center rounded-ui-rect border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] ${
              active
                ? "border-[#0A823E] bg-[#0A823E] text-white"
                : "border-sam-border bg-sam-surface text-sam-fg hover:border-[#0A823E]/50 hover:bg-[#0A823E]/5"
            }`}
            data-admin-ads-nav-active={active ? "1" : "0"}
            aria-current={active ? "page" : undefined}
          >
            {lang === "en" ? item.labelEn : item.labelKo}
          </Link>
        );
      })}
    </nav>
  );
}
