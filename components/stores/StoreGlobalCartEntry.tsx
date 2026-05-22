"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StoreCommerceCartPageShell } from "@/components/stores/cart/StoreCommerceCartPageShell";
import { StoreBaeminCartTopBar } from "@/components/stores/cart/baemin/StoreBaeminCartTopBar";
import { useStoreCartBack } from "@/components/stores/cart/use-store-cart-back";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { formatMoneyPhp } from "@/lib/utils/format";
import { sortedNonemptyCommerceBuckets } from "@/lib/stores/store-commerce-cart-nav";

/**
 * `/stores/cart` — 통합 장바구니 진입.
 * 담긴 매장이 있으면 해당 매장 카트로 replace, 없으면 배민식 빈 장바구니(하단 5탭과 동일 레일).
 */
export function StoreGlobalCartEntry() {
  const { t } = useI18n();
  const router = useRouter();
  const cart = useStoreCommerceCartOptional();

  const buckets = useMemo(
    () => (cart?.hydrated ? sortedNonemptyCommerceBuckets(cart.listCartBuckets()) : []),
    [cart]
  );
  const cartSlug = buckets[0]?.storeSlug?.trim() ?? "";
  const goCartBack = useStoreCartBack(cartSlug);

  const target = useMemo(() => {
    const first = buckets[0] ?? null;
    const slug = first?.storeSlug?.trim() ?? "";
    if (!slug) return null;
    return `/stores/${encodeURIComponent(slug)}/cart`;
  }, [buckets]);

  useEffect(() => {
    if (!target) return;
    router.replace(target, { scroll: false });
  }, [router, target]);

  if (!cart?.hydrated) {
    return (
      <StoreCommerceCartPageShell
        storeSlug={cartSlug || undefined}
        header={<StoreBaeminCartTopBar onBack={goCartBack} />}
      >
        <div className="px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
      </StoreCommerceCartPageShell>
    );
  }

  if (target) {
    return (
      <StoreCommerceCartPageShell
        storeSlug={cartSlug}
        header={<StoreBaeminCartTopBar onBack={goCartBack} />}
      >
        <div className="px-4 py-12 text-center sam-text-body text-sam-muted">{t("store_navigating")}</div>
      </StoreCommerceCartPageShell>
    );
  }

  return (
    <StoreCommerceCartPageShell header={<StoreBaeminCartTopBar onBack={goCartBack} />}>
      <div className="px-4 py-10">
        <div className="text-center">
          <p className="sam-text-body-lg font-semibold text-sam-fg">{t("store_cart_empty")}</p>
          <p className="mt-1 sam-text-body text-sam-muted">{t("store_cart_empty_hint")}</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/stores"
            className="inline-flex h-11 min-w-[11.5rem] items-center justify-center rounded-full border border-sam-border bg-white px-6 sam-text-body font-semibold text-sam-fg shadow-sm active:bg-sam-app"
          >
            {t("store_browse_stores")}
          </Link>
        </div>
      </div>
    </StoreCommerceCartPageShell>
  );
}
