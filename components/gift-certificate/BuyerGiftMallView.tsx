"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftMallProductCard } from "@/components/gift-certificate/GiftMallProductCard";
import { useCommerceChildChrome } from "@/lib/delivery/customer/commerce-child-chrome";
import { canonicalHubHref, giftProductHref } from "@/lib/delivery/customer/commerce-hub-nav";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

type MallScopeFilter = "all" | "platform" | "store";

const G5_CLIENT_FILTER_MAX = 100;

export function BuyerGiftMallView() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() || "";
  const from = searchParams.get("from")?.trim() || "";
  const backHref =
    from === "delivery-activity"
      ? canonicalHubHref("gifts", { from })
      : from === "store-detail" && storeId
        ? undefined
        : "/stores";
  const [products, setProducts] = useState<GiftMallProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MallScopeFilter>("all");

  useCommerceChildChrome({
    titleKey: "gift_u2_mall_title",
    backHref: backHref ?? "/stores",
    preferHistoryBack: true,
  });

  const load = useCallback(async () => {
    setReady(false);
    setLoadError(false);
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    try {
      const res = await fetch(`/api/me/gift-certificates/mall${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; products?: GiftMallProduct[] };
      if (!res.ok || !json.ok) {
        setProducts([]);
        setLoadError(true);
        return;
      }
      setProducts(json.products ?? []);
    } catch {
      setProducts([]);
      setLoadError(true);
    } finally {
      setReady(true);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProductCount = products.length;
  const clientFilterAllowed = activeProductCount <= G5_CLIENT_FILTER_MAX;

  const visibleProducts = useMemo(() => {
    if (!clientFilterAllowed || scopeFilter === "all") return products;
    if (scopeFilter === "platform") return products.filter((p) => p.giftScope === "PLATFORM");
    return products.filter((p) => p.giftScope === "STORE");
  }, [products, scopeFilter, clientFilterAllowed]);

  const walletHref = canonicalHubHref("gifts", { from: from || null });

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-gift-mall="1"
      data-ready={ready ? "1" : "0"}
      data-active-product-count={activeProductCount}
      data-client-filter-allowed={clientFilterAllowed ? "1" : "0"}
    >
      {clientFilterAllowed ? (
        <div className="mb-3 flex flex-wrap gap-2" data-gift-mall-scope-filter="1">
          {(["all", "platform", "store"] as const).map((id) => {
            const selected = scopeFilter === id;
            const labelKey =
              id === "all"
                ? "commerce_hub_mall_filter_all"
                : id === "platform"
                  ? "commerce_hub_mall_filter_platform"
                  : "commerce_hub_mall_filter_store";
            return (
              <button
                key={id}
                type="button"
                data-gift-mall-filter={id}
                aria-pressed={selected}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
                }`}
                onClick={() => setScopeFilter(id)}
              >
                {safeT(labelKey, {
                  fallbackKo: id === "all" ? "전체" : id === "platform" ? "DIBAY 상품권" : "매장 상품권",
                  fallbackEn: id === "all" ? "All" : id === "platform" ? "DIBAY gifts" : "Store gifts",
                })}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="mb-3 text-sm leading-relaxed text-sam-muted" data-gift-mall-desc="1">
        {safeT("gift_u2_mall_desc", {
          fallbackKo: "D-Point로 매장 상품권을 구매할 수 있습니다. 상품권 잔액은 만료되지 않습니다.",
          fallbackEn: "Buy store gift certificates with D-Point. Gift balances never expire.",
        })}
      </p>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href={walletHref}
          prefetch={false}
          className={`${Sam.btn.secondary} inline-flex min-h-[48px] flex-1 items-center justify-center px-4 text-sm`}
          data-gift-mall-wallet-cta="1"
        >
          {safeT("commerce_hub_gift_my_wallet_cta", {
            fallbackKo: "내 상품권",
            fallbackEn: "My gifts",
          })}
        </Link>
      </div>

      {loadError ? (
        <div className="space-y-3" data-gift-mall-error="1">
          <p className="text-sm text-sam-danger">
            {safeT("gift_u2_mall_error", {
              fallbackKo: "상품권을 불러오지 못했습니다.",
              fallbackEn: "Could not load gift certificates.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_u2_mall_retry", {
              fallbackKo: "다시 시도",
              fallbackEn: "Try again",
            })}
          </button>
        </div>
      ) : !ready ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-sam-muted">…</div>
      ) : visibleProducts.length === 0 ? (
        <p className="text-sm text-sam-muted" data-gift-mall-empty="1">
          {safeT("gift_u2_mall_empty", {
            fallbackKo: "현재 판매 중인 상품권이 없습니다.",
            fallbackEn: "No gift certificates are currently on sale.",
          })}
        </p>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-4 pb-8 md:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
          {visibleProducts.map((p) => (
            <GiftMallProductCard
              key={p.id}
              product={p}
              href={giftProductHref(p.id, { storeId: storeId || p.storeId, from: from || null })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
