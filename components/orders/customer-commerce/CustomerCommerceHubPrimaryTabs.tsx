"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMERCE_HUB_TABS,
  canonicalHubHref,
  parseCommerceHubState,
  type CommerceHubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

const TAB_KEY: Record<
  CommerceHubTab,
  "commerce_hub_tab_orders" | "commerce_hub_tab_coupons" | "commerce_hub_tab_gifts"
> = {
  orders: "commerce_hub_tab_orders",
  coupons: "commerce_hub_tab_coupons",
  gifts: "commerce_hub_tab_gifts",
};

/** Primary hub tabs — URL is source of truth (G1: path-embedded in AppStickyHeader). */
export function CustomerCommerceHubPrimaryTabs() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const state = parseCommerceHubState(searchParams);

  return (
    <nav
      className={`${APP_MAIN_HEADER_INNER_CLASS} border-b border-sam-border bg-sam-surface/95`}
      data-commerce-hub-primary-tabs="1"
      role="tablist"
      aria-label={safeT("commerce_hub_title", {
        fallbackKo: "주문·혜택",
        fallbackEn: "Orders & benefits",
      })}
    >
      <div className="grid min-w-0 grid-cols-3 gap-0">
        {COMMERCE_HUB_TABS.map((id) => {
          const selected = state.tab === id;
          const href = canonicalHubHref(id, {
            giftTab: state.giftTab,
            couponTab: state.couponTab,
            from: state.from,
          });
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              role="tab"
              aria-selected={selected}
              data-commerce-hub-tab={id}
              className={`relative flex min-h-[48px] min-w-0 items-center justify-center px-2 text-sm font-semibold ${
                selected ? "text-signature" : "text-sam-muted"
              }`}
            >
              {safeT(TAB_KEY[id], {
                fallbackKo:
                  id === "orders" ? "주문 내역" : id === "coupons" ? "쿠폰" : "상품권",
                fallbackEn: id === "orders" ? "Orders" : id === "coupons" ? "Coupons" : "Gifts",
              })}
              {selected ? (
                <span
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-signature"
                  aria-hidden
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
