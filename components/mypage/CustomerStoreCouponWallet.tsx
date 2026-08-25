"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  couponWalletStatusKey,
  CUSTOMER_COUPON_WALLET_TABS,
  formatCouponWalletDay,
  isOpaqueId,
  type CustomerCouponWalletTab,
} from "@/lib/stores/customer-coupon-wallet-view";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { formatMoneyPhp } from "@/lib/utils/format";

type CampaignSnippet = {
  title?: string;
  discount_type?: string;
  discount_value?: number;
  min_order_amount?: number | null;
};

type WalletRow = Record<string, unknown> & {
  id?: string;
  store_id?: string;
  status?: string;
  bucket?: string;
  expires_at?: string;
  redeemed_order_id?: string | null;
  reserved_php?: number | null;
  store_name?: string | null;
  store_slug?: string | null;
  order_no?: string | null;
  order_created_at?: string | null;
  store_coupon_campaigns?: CampaignSnippet | null;
};

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

function benefitText(c: CampaignSnippet | null | undefined): string {
  if (!c || c.discount_value == null) return "";
  if (c.discount_type === "percent") return `${c.discount_value}%`;
  return formatMoneyPhp(c.discount_value);
}

export function CustomerStoreCouponWallet() {
  const { t, safeT } = useI18n();
  const [tab, setTab] = useState<CustomerCouponWalletTab>("available");
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [authed, setAuthed] = useState(true);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/store-coupons?tab=all", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      setAuthed(false);
      setRows([]);
      setReady(true);
      return;
    }
    setAuthed(true);
    const json = (await res.json()) as { ok?: boolean; coupons?: WalletRow[] };
    setRows(json.ok ? json.coupons ?? [] : []);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { available: 0, expiring: 0, redeemed: 0, expired: 0 };
    for (const row of rows) {
      const b = String(row.bucket ?? "");
      if (b === "available" || b === "expiring" || b === "redeemed" || b === "expired") c[b] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => rows.filter((row) => String(row.bucket ?? "") === tab), [rows, tab]);

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-customer-coupon-wallet="1"
      data-wallet-ready={ready ? "1" : "0"}
    >
      <MySubpageHeader titleKey="store_coupon_wallet_title" backHref="/mypage" />
      <div className="grid min-w-0 grid-cols-4 gap-1" data-customer-coupon-wallet-tabs="1">
        {CUSTOMER_COUPON_WALLET_TABS.map((id) => {
          const selected = tab === id;
          const count = counts[id];
          const label = t(TAB_LABEL[id]);
          return (
            <button
              key={id}
              type="button"
              data-wallet-tab={id}
              data-wallet-tab-count={count}
              aria-selected={selected}
              aria-label={count > 0 ? `${label} ${count}` : label}
              className={`flex min-w-0 flex-col items-center justify-center rounded-ui-rect px-0.5 py-2 ${
                selected ? "bg-signature/15 text-sam-fg" : "bg-sam-app text-sam-muted"
              }`}
              onClick={() => setTab(id)}
            >
              <span className="w-full text-center text-[10px] font-bold leading-[1.2]">{label}</span>
              <span className="min-h-[14px] text-[12px] font-bold leading-none tabular-nums">{count}</span>
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
        <ul className="min-w-0 space-y-2 pb-8">
          {visible.map((row) => {
            const campaign = row.store_coupon_campaigns ?? null;
            const title = String(campaign?.title ?? "").trim();
            const storeName = String(row.store_name ?? "").trim();
            const storeLabel =
              storeName && !isOpaqueId(storeName)
                ? storeName
                : safeT("store_coupon_wallet_store_fallback", {
                    fallbackKo: "매장",
                    fallbackEn: "Store",
                  });
            const slug = String(row.store_slug ?? "").trim();
            const day = formatCouponWalletDay(row.expires_at);
            const statusKey = couponWalletStatusKey(row);
            const orderNo = String(row.order_no ?? "").trim();
            const orderId = String(row.redeemed_order_id ?? "").trim();
            const usedDay = formatCouponWalletDay(row.order_created_at) || day;
            const isRedeemed = String(row.bucket ?? "") === "redeemed";
            return (
              <li
                key={String(row.id)}
                className="min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-wallet-card="1"
                data-wallet-bucket={String(row.bucket ?? "")}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium text-sam-fg" data-wallet-benefit="">
                    {benefitText(campaign)}
                  </p>
                  <span className="shrink-0 text-xs text-sam-muted" data-wallet-status="">
                    {t(statusKey)}
                  </span>
                </div>
                {title ? (
                  <p className="mt-0.5 min-w-0 break-words text-sm text-sam-fg" data-wallet-title="">
                    {title}
                  </p>
                ) : null}
                <p className="mt-1 min-w-0 break-words text-xs text-sam-muted">
                  {slug ? (
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`/stores/${encodeURIComponent(slug)}`}
                      data-wallet-store=""
                    >
                      {storeLabel}
                    </Link>
                  ) : (
                    <span data-wallet-store="">{storeLabel}</span>
                  )}
                  {campaign?.min_order_amount != null ? (
                    <span data-wallet-min-order="">
                      {` · ${t("store_coupon_min_order")} ${formatMoneyPhp(campaign.min_order_amount)}`}
                    </span>
                  ) : null}
                </p>
                {isRedeemed && usedDay ? (
                  <p className="mt-1 text-xs text-sam-muted" data-wallet-day="">
                    {t("store_coupon_wallet_used_on", { date: usedDay })}
                  </p>
                ) : null}
                {!isRedeemed && day ? (
                  <p className="mt-1 text-xs text-sam-muted" data-wallet-day="">
                    {t("store_coupon_wallet_valid_until", { date: day })}
                  </p>
                ) : null}
                {orderNo && !isOpaqueId(orderNo) && orderId ? (
                  <p className="mt-1 min-w-0 break-words text-xs text-sam-muted" data-wallet-order="">
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`/mypage/store-orders/${encodeURIComponent(orderId)}`}
                    >
                      {t("store_coupon_wallet_order", { orderNo })}
                    </Link>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
