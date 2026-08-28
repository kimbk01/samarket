"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCouponCustomerCard } from "@/components/stores/coupon/StoreCouponCustomerCard";
import { CommerceEmptyState } from "./CommerceEmptyState";
import {
  markCommerceHubFetchUnauthed,
  useCommerceHubTabFetch,
} from "./useCommerceHubTabFetch";
import {
  canonicalHubHref,
  deliveryDiscoveryHref,
  type CouponSubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import {
  customerWalletPresentationTab,
  type CustomerCouponWalletTab,
} from "@/lib/stores/customer-coupon-wallet-view";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";
import { writeStoreCouponHandoff } from "@/lib/stores/store-coupon-handoff";

const COUPON_TAB_MAP: Record<CouponSubTab, CustomerCouponWalletTab> = {
  held: "held",
  used: "redeemed",
};

const TAB_KEY: Record<
  CouponSubTab,
  "commerce_hub_coupon_tab_held" | "commerce_hub_coupon_tab_used"
> = {
  held: "commerce_hub_coupon_tab_held",
  used: "commerce_hub_coupon_tab_used",
};

type CouponFetchResult = { authed: boolean; cards: CustomerCouponCardView[] };

async function fetchCoupons(signal: AbortSignal): Promise<CouponFetchResult> {
  const res = await fetch("/api/me/store-coupons?tab=all", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (res.status === 401) {
    markCommerceHubFetchUnauthed("commerce-hub:coupons");
    return { authed: false, cards: [] };
  }
  const json = (await res.json()) as { ok?: boolean; cards?: CustomerCouponCardView[] };
  return { authed: true, cards: json.ok ? json.cards ?? [] : [] };
}

/** Coupons tab body — URL `couponTab` is source of truth. */
export function CustomerCouponWalletBody({
  couponTab,
  refresh = false,
}: {
  couponTab: CouponSubTab;
  refresh?: boolean;
}) {
  const { safeT } = useI18n();
  const tab = COUPON_TAB_MAP[couponTab];
  const { data, ready, authed } = useCommerceHubTabFetch({
    cacheKey: "commerce-hub:coupons",
    enabled: true,
    refresh,
    fetcher: fetchCoupons,
  });

  const cards = data?.cards ?? [];
  const isAuthed = data?.authed ?? authed;

  const counts = useMemo(() => {
    const c = { held: 0, redeemed: 0 };
    for (const card of cards) {
      const present = customerWalletPresentationTab(card.bucket);
      if (present) c[present] += 1;
    }
    return c;
  }, [cards]);

  const visible = useMemo(
    () => cards.filter((c) => customerWalletPresentationTab(c.bucket) === tab),
    [cards, tab]
  );

  return (
    <div data-customer-coupon-wallet="1" data-wallet-ready={ready ? "1" : "0"}>
      <div
        className="mb-3 grid min-w-0 grid-cols-2 gap-2"
        data-customer-coupon-wallet-tabs="1"
        role="tablist"
      >
        {(["held", "used"] as const).map((id) => {
          const selected = couponTab === id;
          const count = counts[COUPON_TAB_MAP[id]];
          const href = canonicalHubHref("coupons", { couponTab: id });
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              role="tab"
              aria-selected={selected}
              data-wallet-tab={id}
              className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-ui-rect px-2 text-sm font-medium ${
                selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              <span className="min-w-0 truncate">
                {safeT(TAB_KEY[id], {
                  fallbackKo: id === "held" ? "보유 쿠폰" : "사용 완료 쿠폰",
                  fallbackEn: id === "held" ? "Held coupons" : "Used coupons",
                })}
              </span>
              {count > 0 ? <span className="tabular-nums">{count}</span> : null}
            </Link>
          );
        })}
      </div>
      {!ready ? (
        <div className="flex min-h-[24vh] items-center justify-center text-sm text-sam-muted">…</div>
      ) : !isAuthed ? (
        <p className="text-sm text-sam-muted">
          {safeT("store_coupon_wallet_login", {
            fallbackKo: "로그인하면 쿠폰을 볼 수 있습니다.",
            fallbackEn: "Sign in to see your coupons.",
          })}
        </p>
      ) : visible.length === 0 ? (
        <CommerceEmptyState
          icon="🎟️"
          title={safeT("commerce_hub_coupons_empty_title", {
            fallbackKo: "사용 가능한 쿠폰이 없습니다.",
            fallbackEn: "You have no coupons.",
          })}
          ctaHref={deliveryDiscoveryHref()}
          ctaLabel={safeT("commerce_hub_coupons_empty_cta", {
            fallbackKo: "배달 매장 둘러보기",
            fallbackEn: "Browse delivery stores",
          })}
        />
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {visible.map((card) => (
            <li key={card.entitlementId}>
              <StoreCouponCustomerCard
                card={card}
                onUse={
                  card.cta === "use" && card.entitlementId
                    ? () => {
                        writeStoreCouponHandoff({
                          storeId: card.storeId,
                          userCouponId: card.entitlementId,
                          couponNumber: card.couponNumber ?? "",
                          offerId: card.campaignId,
                        });
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
