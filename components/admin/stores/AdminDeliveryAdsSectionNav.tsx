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
    labelKo: "운영",
    labelEn: "Ops",
    dataAttr: null as string | null,
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.inventory,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.inventory),
    labelKo: "지면 관리",
    labelEn: "Placements",
    dataAttr: null as string | null,
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.commercialSettings,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.commercialSettings),
    labelKo: "상품·가격",
    labelEn: "Products & prices",
    dataAttr: "data-admin-delivery-ads-commercial-link",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.partnerMemberships,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.partnerMemberships),
    labelKo: "Partner",
    labelEn: "Partner",
    dataAttr: "data-admin-delivery-ads-partner-link",
  },
  {
    href: DELIVERY_AD_ADMIN_ROUTES.cashCharges,
    match: (p: string) => p.startsWith(DELIVERY_AD_ADMIN_ROUTES.cashCharges),
    labelKo: "Cash 충전",
    labelEn: "Cash top-up",
    dataAttr: "data-admin-delivery-ads-cash-charges-link",
  },
] as const;

/**
 * Ops tabs + separated primary create action (not equal-weight with section tabs).
 * First-party / commercial / partner discoverability markers live on these real Links
 * (not sr-only ghosts on the hub page).
 */
export function AdminDeliveryAdsSectionNav() {
  const pathname = usePathname() || "";
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const createActive = pathname.startsWith("/admin/delivery-ads/first-party");

  return (
    <nav
      className="mb-4 flex flex-wrap items-center justify-between gap-2"
      data-admin-delivery-ads-section-nav="1"
      data-admin-delivery-ads-nav-layout="tabs-plus-primary"
      aria-label={safeT("admin_delivery_ads_section_nav_aria", {
        fallbackKo: "배달 광고 관리 메뉴",
        fallbackEn: "Delivery ads admin menu",
      })}
    >
      <div className="flex flex-wrap gap-2" data-admin-ads-nav-tabs="1">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const extraProps =
            item.dataAttr != null ? { [item.dataAttr]: "1" as const } : {};
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
              {...extraProps}
            >
              {lang === "en" ? item.labelEn : item.labelKo}
            </Link>
          );
        })}
      </div>
      <Link
        href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew}
        className={`inline-flex min-h-[40px] items-center rounded-ui-rect px-3 text-[13px] font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] ${
          createActive ? "bg-[#087a38]" : "bg-[#0A823E] hover:bg-[#087a38]"
        }`}
        data-admin-ads-nav-primary-create="1"
        data-admin-delivery-ads-first-party-cta="1"
        aria-current={createActive ? "page" : undefined}
      >
        {lang === "en" ? "+ Create DIBAY ad" : "+ 디바이 광고 만들기"}
      </Link>
    </nav>
  );
}
