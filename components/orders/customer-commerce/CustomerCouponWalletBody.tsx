"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCouponCustomerCard } from "@/components/stores/coupon/StoreCouponCustomerCard";
import { CommerceEmptyState } from "./CommerceEmptyState";
import { CommerceHubSegmentTabs } from "./CommerceHubSegmentTabs";
import {
  markCommerceHubFetchUnauthed,
  useCommerceHubTabFetch,
} from "./useCommerceHubTabFetch";
import {
  canonicalHubHref,
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
  // 실패는 throw — 빈 목록으로 캐시하지 않는다
  if (!res.ok) throw new Error(`coupons_${res.status}`);
  const json = (await res.json()) as { ok?: boolean; cards?: CustomerCouponCardView[] };
  if (json.ok !== true) throw new Error("coupons_not_ok");
  return { authed: true, cards: json.cards ?? [] };
}

/** Coupons tab body — URL `couponTab` is source of truth. */
export function CustomerCouponWalletBody({
  couponTab,
  refresh = false,
}: {
  couponTab: CouponSubTab;
  refresh?: boolean;
}) {
  const { t, safeT } = useI18n();
  const tab = COUPON_TAB_MAP[couponTab];
  const { data, ready, authed, error, reload } = useCommerceHubTabFetch({
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
      <CommerceHubSegmentTabs
        tabs={["held", "used"] as const}
        activeId={couponTab}
        hrefFor={(id) => canonicalHubHref("coupons", { couponTab: id })}
        labelFor={(id) =>
          safeT(TAB_KEY[id], {
            fallbackKo: id === "held" ? "보유" : "사용 완료",
            fallbackEn: id === "held" ? "Held" : "Used",
          })
        }
        countFor={(id) => (ready && data ? counts[COUPON_TAB_MAP[id]] : null)}
        dataAttr="data-wallet-tab"
      />
      {!ready ? (
        <CouponWalletCardsSkeleton />
      ) : !isAuthed ? (
        <p className="text-sm text-sam-muted">
          {safeT("store_coupon_wallet_login", {
            fallbackKo: "로그인하면 쿠폰을 볼 수 있습니다.",
            fallbackEn: "Sign in to see your coupons.",
          })}
        </p>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center" data-wallet-error="1">
          <p className="text-sm text-sam-muted">{t("common_fetch_list_failed")}</p>
          <button type="button" className="sam-btn sam-btn--secondary sam-btn--sm" onClick={reload}>
            {t("common_retry")}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <CommerceEmptyState
          icon="🎟️"
          title={safeT("commerce_hub_coupons_empty_title", {
            fallbackKo: "보유한 쿠폰이 없습니다.",
            fallbackEn: "You have no coupons.",
          })}
          description={safeT("commerce_hub_coupons_empty_wallet_only", {
            fallbackKo: "보유·사용 내역은 이 화면에서 확인할 수 있습니다.",
            fallbackEn: "View held and used coupons here.",
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

/** S44 스켈레톤 — 쿠폰 카드 3(좌 금액 블록 · 우 2줄). 탭은 실제 라벨로 먼저 그린다. */
export function CouponWalletCardsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="coupon-wallet-skeleton" className="min-w-0 space-y-3 pb-8">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="flex items-stretch gap-3 overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3"
        >
          <span className={`h-16 w-20 shrink-0 ${bone}`} />
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <span className={`h-4 w-[65%] ${bone}`} />
            <span className={`h-3 w-[45%] ${bone}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}
