"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftMallProductCard } from "@/components/gift-certificate/GiftMallProductCard";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

function mallDetailHref(productId: string, storeId?: string | null) {
  const base = `/stores/gift-mall/${encodeURIComponent(productId)}`;
  if (!storeId) return base;
  return `${base}?storeId=${encodeURIComponent(storeId)}`;
}

export function BuyerGiftMallView() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() || "";
  const from = searchParams.get("from")?.trim() || "";
  const backHref =
    from === "delivery-activity"
      ? "/orders/activity"
      : from === "store-detail" && storeId
        ? undefined
        : "/stores";
  const [products, setProducts] = useState<GiftMallProduct[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    const res = await fetch(`/api/me/gift-certificates/mall${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; products?: GiftMallProduct[] };
    setProducts(json.ok ? json.products ?? [] : []);
    setReady(true);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-mall="1" data-ready={ready ? "1" : "0"}>
      <MySubpageHeader
        title={safeT("gift_u2_mall_title", {
          fallbackKo: "상품권 몰",
          fallbackEn: "Gift mall",
        })}
        titleKey="gift_u2_mall_title"
        backHref={backHref ?? "/stores"}
      />
      <p className="mb-3 text-sm text-sam-muted">
        {safeT("gift_u2_mall_desc", {
          fallbackKo: "D-Point로 매장 상품권을 구매할 수 있습니다. 상품권 잔액은 만료되지 않습니다.",
          fallbackEn: "Buy store gift certificates with D-Point. Gift balances never expire.",
        })}
      </p>
      <div className="mb-4">
        <Link
          href={
            from === "delivery-activity"
              ? "/mypage/gift-certificates?from=delivery-activity"
              : "/mypage/gift-certificates"
          }
          prefetch={false}
          className={`${Sam.btn.secondary} inline-flex min-h-[44px] items-center justify-center px-4 text-sm`}
          data-gift-mall-wallet-cta="1"
        >
          {safeT("gift_u2_mall_wallet_cta", {
            fallbackKo: "내 상품권",
            fallbackEn: "My gifts",
          })}
        </Link>
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u2_mall_empty", {
            fallbackKo: "판매 중인 상품권이 없습니다.",
            fallbackEn: "No gift certificates on sale.",
          })}
        </p>
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {products.map((p) => (
            <GiftMallProductCard
              key={p.id}
              product={p}
              href={mallDetailHref(p.id, storeId || undefined)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
