"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef } from "react";
import { StoreOrderStickyHeader } from "@/components/stores/store-order-detail/StoreOrderStickyHeader";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import { dibayPerfOnStoreDetailShellVisible } from "@/lib/dibay/delivery-flow-perf";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import {
  DELIVERY_PERF_TAG_STORE_ENTRY,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { STORE_DETAIL_HERO_SHELL_CLASS } from "@/lib/dibay/store-detail-hero-layout";

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-neutral-200/80 via-neutral-100/90 to-neutral-200/80 bg-[length:200%_100%] ${className}`}
      style={{ animationDuration: "1.2s" }}
    />
  );
}

function slugToPlaceholderTitle(slug: string, fallbackName: string): string {
  let s = slug.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* already decoded */
  }
  const t = s.replace(/-/g, " ").trim();
  return t.length > 0 ? t : fallbackName;
}

/**
 * 매장 공개 API 대기 중 첫 페인트 — 실제 헤더·히어로 자리·메뉴 스켈레톤만 즉시 노출.
 */
export function StoreDetailQuickShell({
  slug,
  fallbackHref,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  onMenuSearchFocus,
  onShareClick,
  onCartPreviewClick,
}: {
  slug: string;
  fallbackHref: string;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
  onMenuSearchFocus: () => void;
  onShareClick: () => void;
  onCartPreviewClick: () => void;
}) {
  const { t } = useI18n();
  const decoded = useMemo(() => decodeSlugSegment(slug), [slug]);
  const title = useMemo(
    () => slugToPlaceholderTitle(decoded || slug, t("store_fallback_name")),
    [decoded, slug, t]
  );
  const pass0LoggedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const key = decoded || slug;
    if (!key || pass0LoggedRef.current === key) return;
    pass0LoggedRef.current = key;
    dibayPerfOnStoreDetailShellVisible({ slug: key });
    deliveryShellEntryMark("shell_visible", { slug: key, source: "quick_shell" });
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_STORE_ENTRY, {
      event: "pass0_quick_shell_visible",
      slug: key,
      pass: 0,
      network_waited: false,
    });
  }, [decoded, slug]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-white pb-8 [-webkit-overflow-scrolling:touch]">
      <StoreOrderStickyHeader
        elevated={false}
        heroGlassOverlayButtons
        fallbackHref={fallbackHref}
        storeSlug={decoded || slug}
        storeName={title}
        commerceCartStoreId=""
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={onFavoriteClick}
        onMenuSearchFocus={onMenuSearchFocus}
        onShareClick={onShareClick}
        onCartPreviewClick={onCartPreviewClick}
      />

      <Shimmer className={STORE_DETAIL_HERO_SHELL_CLASS} />
      <div className="mx-4 -mt-7 rounded-[20px] bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
        <Shimmer className="h-7 w-3/4 rounded" />
        <Shimmer className="mt-3 h-4 w-1/2 rounded" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Shimmer className="h-10 rounded-lg" />
          <Shimmer className="h-10 rounded-lg" />
          <Shimmer className="h-10 rounded-lg" />
        </div>
        <Shimmer className="mt-4 h-9 w-full rounded-full" />
      </div>

      <div className="mt-4 border-y border-neutral-100">
        <Shimmer className="h-[48px] w-full rounded-none" />
      </div>
      <div className="mt-2 px-4">
        <div className="flex gap-2 overflow-hidden">
          <Shimmer className="h-[34px] w-20 shrink-0 rounded-full" />
          <Shimmer className="h-[34px] w-24 shrink-0 rounded-full" />
          <Shimmer className="h-[34px] w-16 shrink-0 rounded-full" />
        </div>
      </div>
      <div className="mt-6 space-y-4 px-4">
        <Shimmer className="h-5 w-32 rounded" />
        {[1, 2, 3].map((k) => (
          <div key={k} className="flex gap-3 border-b border-neutral-100 py-3">
            <Shimmer className="h-24 w-24 shrink-0 rounded-[14px]" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-4 w-full rounded" />
              <Shimmer className="h-3 w-2/3 rounded" />
              <Shimmer className="h-4 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 px-4 pb-4 text-center">
        <Link
          href="/stores"
          className="text-[12px] font-normal text-neutral-400 underline underline-offset-2"
        >
          {t("store_back_to_store_list")}
        </Link>
      </div>
    </div>
  );
}
