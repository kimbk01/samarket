"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreCouponCustomerCard } from "@/components/stores/coupon/StoreCouponCustomerCard";
import {
  CUSTOMER_COUPON_WALLET_TABS,
  type CustomerCouponWalletTab,
} from "@/lib/stores/customer-coupon-wallet-view";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

const TAB_LABEL: Record<
  CustomerCouponWalletTab,
  | "store_coupon_wallet_tab_available"
  | "store_coupon_wallet_tab_expiring"
  | "store_coupon_wallet_tab_redeemed"
  | "store_coupon_wallet_tab_expired"
> = {
  available: "store_coupon_wallet_tab_available",
  expiring: "store_coupon_wallet_tab_expiring",
  redeemed: "store_coupon_wallet_tab_redeemed",
  expired: "store_coupon_wallet_tab_expired",
};

export function CustomerStoreCouponWallet() {
  const { t, safeT } = useI18n();
  const [tab, setTab] = useState<CustomerCouponWalletTab>("available");
  const [cards, setCards] = useState<CustomerCouponCardView[]>([]);
  const [authed, setAuthed] = useState(true);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/store-coupons?tab=all", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      setAuthed(false);
      setCards([]);
      setReady(true);
      return;
    }
    setAuthed(true);
    const json = (await res.json()) as { ok?: boolean; cards?: CustomerCouponCardView[] };
    setCards(json.ok ? json.cards ?? [] : []);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { available: 0, expiring: 0, redeemed: 0, expired: 0 };
    for (const card of cards) {
      const b = card.bucket;
      if (b === "available" || b === "expiring" || b === "redeemed" || b === "expired") c[b] += 1;
    }
    return c;
  }, [cards]);

  const visible = useMemo(() => cards.filter((c) => c.bucket === tab), [cards, tab]);

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-customer-coupon-wallet="1"
      data-wallet-ready={ready ? "1" : "0"}
    >
      <MySubpageHeader titleKey="store_coupon_wallet_title" backHref="/mypage" />
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" data-customer-coupon-wallet-tabs="1">
        {CUSTOMER_COUPON_WALLET_TABS.map((id) => {
          const selected = tab === id;
          const count = counts[id];
          const label = t(TAB_LABEL[id]);
          return (
            <button
              key={id}
              type="button"
              data-wallet-tab={id}
              aria-selected={selected}
              className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-ui-rect px-2 text-sm font-medium ${
                selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
              onClick={() => setTab(id)}
            >
              <span className="min-w-0 truncate">{label}</span>
              {count > 0 ? <span className="tabular-nums">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {!authed ? (
        <p className="text-sm text-sam-muted">
          {safeT("store_coupon_wallet_login", {
            fallbackKo: "로그인하면 쿠폰을 볼 수 있습니다.",
            fallbackEn: "Sign in to see your coupons.",
          })}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("store_coupon_wallet_empty", {
            fallbackKo: "표시할 쿠폰이 없습니다.",
            fallbackEn: "No coupons to show.",
          })}
        </p>
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {visible.map((card) => (
            <li key={card.entitlementId}>
              <StoreCouponCustomerCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
