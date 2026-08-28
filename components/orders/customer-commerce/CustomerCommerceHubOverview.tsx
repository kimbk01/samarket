"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  CommercePrimaryCtaLink,
  CommerceSecondaryCtaLink,
} from "./CommerceHubSegmentTabs";
import {
  canonicalHubHref,
  giftMallHref,
  type CommerceHubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import type { BuyerStoreOrdersHubSummary } from "@/lib/delivery/customer/load-buyer-store-orders-hub-summary";
import type { GiftWalletOverviewSummary } from "@/lib/gift-certificate/load-gift-wallet";
import { customerWalletPresentationTab } from "@/lib/stores/customer-coupon-wallet-view";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";

type OverviewData = {
  authed: boolean;
  orders: BuyerStoreOrdersHubSummary | null;
  couponHeld: number;
  couponUsable: number;
  gifts: GiftWalletOverviewSummary | null;
};

async function fetchOverview(signal: AbortSignal): Promise<OverviewData> {
  const [ordersRes, couponsRes, giftsRes] = await Promise.all([
    fetch("/api/me/store-orders?hub_summary=1", { credentials: "include", cache: "no-store", signal }),
    fetch("/api/me/store-coupons?tab=all", { credentials: "include", cache: "no-store", signal }),
    fetch("/api/me/gift-certificates/wallet?summary=1", { credentials: "include", cache: "no-store", signal }),
  ]);

  if (ordersRes.status === 401 || couponsRes.status === 401 || giftsRes.status === 401) {
    return { authed: false, orders: null, couponHeld: 0, couponUsable: 0, gifts: null };
  }

  const ordersJson = (await ordersRes.json()) as { ok?: boolean; hub_summary?: BuyerStoreOrdersHubSummary };
  const couponsJson = (await couponsRes.json()) as { ok?: boolean; cards?: CustomerCouponCardView[] };
  const giftsJson = (await giftsRes.json()) as { ok?: boolean; summary?: GiftWalletOverviewSummary };

  let couponHeld = 0;
  let couponUsable = 0;
  for (const card of couponsJson.ok ? couponsJson.cards ?? [] : []) {
    const tab = customerWalletPresentationTab(card.bucket);
    if (tab === "held") {
      couponHeld += 1;
      if (card.bucket === "available") couponUsable += 1;
    }
  }

  return {
    authed: true,
    orders: ordersJson.ok ? ordersJson.hub_summary ?? null : null,
    couponHeld,
    couponUsable,
    gifts: giftsJson.ok ? giftsJson.summary ?? null : null,
  };
}

const DOMAIN_STYLE: Record<
  CommerceHubTab,
  { accent: string; icon: string; header: string }
> = {
  orders: {
    accent: "border-l-[#6366F1]",
    icon: "📦",
    header: "from-[#EEF2FF] to-white",
  },
  coupons: {
    accent: "border-l-[#3B82F6]",
    icon: "🎟️",
    header: "from-[#EFF6FF] to-white",
  },
  gifts: {
    accent: "border-l-[#059669]",
    icon: "🎁",
    header: "from-[#ECFDF5] to-white",
  },
};

function OverviewBlock({
  title,
  summary,
  children,
  dataSection,
}: {
  title: string;
  summary: ReactNode;
  children: ReactNode;
  dataSection: CommerceHubTab;
}) {
  const style = DOMAIN_STYLE[dataSection];
  return (
    <section
      className={`overflow-hidden rounded-ui-rect border border-sam-border bg-gradient-to-br ${style.header} shadow-sm border-l-4 ${style.accent}`}
      data-commerce-hub-overview-section={dataSection}
    >
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            {style.icon}
          </span>
          <h2 className="text-base font-bold text-sam-fg">{title}</h2>
        </div>
        <div className="mt-2 text-sm text-sam-muted">{summary}</div>
        <div className="mt-3 flex flex-col gap-2">{children}</div>
      </div>
    </section>
  );
}

/** Reference §2 — three-domain overview landing (bare `/orders/activity`). */
export function CustomerCommerceHubOverview({ from }: { from?: string | null }) {
  const { safeT } = useI18n();
  const [data, setData] = useState<OverviewData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setReady(false);
    void fetchOverview(ac.signal)
      .then((next) => {
        if (!ac.signal.aborted) setData(next);
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setData({ authed: false, orders: null, couponHeld: 0, couponUsable: 0, gifts: null });
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setReady(true);
      });
    return () => ac.abort();
  }, []);

  const ordersHref = canonicalHubHref("orders", { from });
  const couponsHref = canonicalHubHref("coupons", { from });
  const giftsHref = canonicalHubHref("gifts", { giftTab: "owned", from });
  const buyHref = giftMallHref({ from: from ?? null });

  const ordersSummary = !ready
    ? "…"
    : !data?.authed
      ? safeT("commerce_hub_overview_login", {
          fallbackKo: "로그인하면 주문 요약을 볼 수 있습니다.",
          fallbackEn: "Sign in to see your order summary.",
        })
      : data.orders && data.orders.totalOrders > 0
        ? safeT("commerce_hub_overview_orders_summary", {
            vars: {
              total: String(data.orders.totalOrders),
              active: String(data.orders.activeOrders),
            },
            fallbackKo: `총 ${data.orders.totalOrders}건 · 진행 중 ${data.orders.activeOrders}건`,
            fallbackEn: `${data.orders.totalOrders} orders · ${data.orders.activeOrders} in progress`,
          })
        : safeT("commerce_hub_orders_empty_title", {
            fallbackKo: "아직 주문 내역이 없습니다.",
            fallbackEn: "No orders yet.",
          });

  const couponsSummary = !ready
    ? "…"
    : !data?.authed
      ? safeT("commerce_hub_overview_login", {
          fallbackKo: "로그인하면 쿠폰 요약을 볼 수 있습니다.",
          fallbackEn: "Sign in to see your coupon summary.",
        })
      : safeT("commerce_hub_overview_coupons_summary", {
          vars: {
            held: String(data?.couponHeld ?? 0),
            usable: String(data?.couponUsable ?? 0),
          },
          fallbackKo: `보유 ${data?.couponHeld ?? 0}장 · 사용 가능 ${data?.couponUsable ?? 0}장`,
          fallbackEn: `${data?.couponHeld ?? 0} held · ${data?.couponUsable ?? 0} usable`,
        });

  const giftsSummary = !ready
    ? "…"
    : !data?.authed
      ? safeT("commerce_hub_overview_login", {
          fallbackKo: "로그인하면 상품권 요약을 볼 수 있습니다.",
          fallbackEn: "Sign in to see your gift summary.",
        })
      : safeT("commerce_hub_overview_gifts_summary", {
          vars: {
            owned: String(data?.gifts?.owned ?? 0),
            received: String(data?.gifts?.receivedPending ?? 0),
          },
          fallbackKo: `보유 ${data?.gifts?.owned ?? 0}장 · 받은 선물 ${data?.gifts?.receivedPending ?? 0}건`,
          fallbackEn: `${data?.gifts?.owned ?? 0} owned · ${data?.gifts?.receivedPending ?? 0} received`,
        });

  return (
    <div className="space-y-3 pb-8" data-commerce-hub-overview="1" data-overview-ready={ready ? "1" : "0"}>
      <OverviewBlock
        title={safeT("commerce_hub_tab_orders", {
          fallbackKo: "주문 내역",
          fallbackEn: "Orders",
        })}
        summary={ordersSummary}
        dataSection="orders"
      >
        <CommercePrimaryCtaLink href={ordersHref} data-commerce-hub-overview-orders-cta="1">
          {safeT("commerce_hub_overview_orders_cta", {
            fallbackKo: "주문 내역 보기",
            fallbackEn: "View orders",
          })}
        </CommercePrimaryCtaLink>
      </OverviewBlock>

      <OverviewBlock
        title={safeT("commerce_hub_tab_coupons", {
          fallbackKo: "쿠폰",
          fallbackEn: "Coupons",
        })}
        summary={couponsSummary}
        dataSection="coupons"
      >
        <CommercePrimaryCtaLink href={couponsHref} data-commerce-hub-overview-coupons-cta="1">
          {safeT("commerce_hub_overview_coupons_cta", {
            fallbackKo: "쿠폰 보기",
            fallbackEn: "View coupons",
          })}
        </CommercePrimaryCtaLink>
      </OverviewBlock>

      <OverviewBlock
        title={safeT("commerce_hub_tab_gifts", {
          fallbackKo: "상품권",
          fallbackEn: "Gift certificates",
        })}
        summary={giftsSummary}
        dataSection="gifts"
      >
        <CommercePrimaryCtaLink href={buyHref} data-commerce-hub-overview-gifts-buy-cta="1">
          {safeT("commerce_hub_gift_buy_cta", {
            fallbackKo: "상품권 구매하기",
            fallbackEn: "Buy gift certificates",
          })}
        </CommercePrimaryCtaLink>
        <CommerceSecondaryCtaLink href={giftsHref} data-commerce-hub-overview-gifts-wallet-cta="1">
          {safeT("commerce_hub_gift_my_wallet_cta", {
            fallbackKo: "내 상품권",
            fallbackEn: "My gifts",
          })}
        </CommerceSecondaryCtaLink>
      </OverviewBlock>
    </div>
  );
}
