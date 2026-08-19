"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";

export type SellerHubNavActive = "hub" | "products" | "sales";

const HUB_HREF = "/market/sell";
const PRODUCTS_HREF = "/mypage/products";

export function SellerHubNav({ active }: { active: SellerHubNavActive }) {
  const { safeT } = useI18n();
  const pathname = usePathname() ?? "";

  const items: { id: SellerHubNavActive; href: string; labelKey: "marketplace_seller_nav_hub" | "marketplace_seller_nav_listings" | "marketplace_seller_nav_trades" }[] = [
    { id: "hub", href: HUB_HREF, labelKey: "marketplace_seller_nav_hub" },
    { id: "products", href: PRODUCTS_HREF, labelKey: "marketplace_seller_nav_listings" },
    { id: "sales", href: MYPAGE_HOME_TRADE_SALES_HREF, labelKey: "marketplace_seller_nav_trades" },
  ];

  return (
    <nav
      aria-label={safeT("marketplace_sell_hub_section_manage", {
        fallbackKo: "판매 관리",
        fallbackEn: "Selling",
      })}
      className="flex w-full gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const isActive =
          active === item.id ||
          (item.id === "hub" && pathname.startsWith(HUB_HREF)) ||
          (item.id === "products" && pathname.startsWith(PRODUCTS_HREF)) ||
          (item.id === "sales" &&
            (pathname.startsWith(MYPAGE_HOME_TRADE_SALES_HREF) || pathname === "/mypage/trade"));
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 sam-text-body-secondary font-medium transition-colors ${
              isActive
                ? "bg-signature text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg-muted hover:bg-sam-surface-muted"
            }`}
          >
            {safeT(item.labelKey, {
              fallbackKo:
                item.id === "hub" ? "판매자 센터" : item.id === "products" ? "등록한 매물" : "거래 관리",
              fallbackEn:
                item.id === "hub" ? "Seller center" : item.id === "products" ? "Your listings" : "Trade management",
            })}
          </Link>
        );
      })}
    </nav>
  );
}
