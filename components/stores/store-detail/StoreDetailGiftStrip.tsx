"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * Store Detail — show active sellable gifts for this store only.
 * Hidden when the store has no active gift products.
 */
export function StoreDetailGiftStrip({ storeId }: { storeId: string }) {
  const { safeT } = useI18n();
  const [products, setProducts] = useState<GiftMallProduct[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) {
      setProducts([]);
      setReady(true);
      return;
    }
    try {
      const res = await fetch(
        `/api/me/gift-certificates/mall?storeId=${encodeURIComponent(sid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; products?: GiftMallProduct[] };
      setProducts(json.ok ? json.products ?? [] : []);
    } catch {
      setProducts([]);
    } finally {
      setReady(true);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready || products.length === 0) return null;

  const mallHref = `/stores/gift-mall?storeId=${encodeURIComponent(storeId.trim())}&from=store-detail`;
  const preview = products.slice(0, 3);

  return (
    <section
      className="min-w-0 px-[var(--delivery-page-x)] py-2"
      data-store-gift-detail-strip="1"
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("gift_u2_store_section_title", {
            fallbackKo: "이 매장 상품권",
            fallbackEn: "Store gift certificates",
          })}
        </h2>
        <Link
          href={mallHref}
          prefetch={false}
          className="shrink-0 text-sm font-medium text-signature"
          data-store-gift-view-cta="1"
        >
          {safeT("gift_u2_store_view_cta", {
            fallbackKo: "상품권 보기",
            fallbackEn: "View gift certificates",
          })}
        </Link>
      </div>
      <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {preview.map((p) => (
          <li key={p.id} className="w-[148px] shrink-0">
            <Link
              href={`/stores/gift-mall/${encodeURIComponent(p.id)}?storeId=${encodeURIComponent(storeId.trim())}`}
              prefetch={false}
              className="flex min-w-0 flex-col gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-2"
              data-store-gift-card={p.id}
            >
              <GiftArtwork src={p.imageUrl} alt={p.title} size={72} className="w-full" />
              <p className="truncate text-xs font-semibold text-sam-fg">{p.title}</p>
              <p className="truncate text-xs tabular-nums text-sam-muted">
                {p.purchasePrice.toLocaleString()} Point
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {products.length > 3 ? (
        <Link
          href={mallHref}
          prefetch={false}
          className={`${Sam.btn.secondary} mt-2 inline-flex min-h-[40px] w-full items-center justify-center px-3 text-sm`}
        >
          {safeT("gift_u2_store_view_cta", {
            fallbackKo: "상품권 보기",
            fallbackEn: "View gift certificates",
          })}
        </Link>
      ) : null}
    </section>
  );
}
