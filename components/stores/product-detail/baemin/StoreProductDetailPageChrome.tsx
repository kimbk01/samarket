"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { StoreOrderStickyHeader } from "@/components/stores/store-order-detail/StoreOrderStickyHeader";
import { StoreProductDetailHeroMedia } from "@/components/stores/product-detail/baemin/StoreProductDetailHeroMedia";
import { openStoreCartPreview } from "@/lib/stores/store-cart-preview-ui-store";
import { readStoreDetailFixedHeaderOffsetPxCached } from "@/lib/ui/store-detail-viewport-metrics";
import { buildStoreProductThumbnailFetchUrlFromPreset } from "@/lib/media/store-product-image-transform";

/**
 * 매장 메뉴 루트와 동일: 포털 고정 헤더(스크롤 시 흰 배경) + 히어로 당김 확대 + 뒤로가기는 항상 해당 매장.
 */
export function StoreProductDetailPageChrome({
  storeSlug,
  storeId,
  headerTitle,
  heroImageUrl,
  profileFallbackUrl,
  galleryUrls,
  galleryIndex,
  onGalleryIndexChange,
  onShare,
  children,
}: {
  storeSlug: string;
  storeId: string;
  /** 스크롤 후 헤더 중앙 제목(메뉴명) */
  headerTitle: string;
  heroImageUrl: string;
  profileFallbackUrl: string;
  galleryUrls: string[];
  galleryIndex: number;
  onGalleryIndexChange: (index: number) => void;
  onShare: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const storeRootHref = `/stores/${encodeURIComponent(storeSlug)}`;
  const [headerSolid, setHeaderSolid] = useState(false);
  const scrollHeaderGate = useRef(false);

  const displayHeroSrc =
    galleryUrls.length > 0
      ? (galleryUrls[galleryIndex] ?? galleryUrls[0] ?? heroImageUrl)
      : heroImageUrl;

  const galleryFetchUrls = useMemo(
    () =>
      galleryUrls.map(
        (u) => buildStoreProductThumbnailFetchUrlFromPreset(u, "galleryStrip") ?? u
      ),
    [galleryUrls]
  );

  const heroVisualForHeader =
    Boolean(displayHeroSrc.trim()) ||
    Boolean(profileFallbackUrl.trim()) ||
    galleryUrls.length > 0;

  useEffect(() => {
    const onScroll = () => {
      if (scrollHeaderGate.current) return;
      scrollHeaderGate.current = true;
      window.requestAnimationFrame(() => {
        scrollHeaderGate.current = false;
        setHeaderSolid((prev) => {
          const hero = document.getElementById("store-hero-media");
          const headerH = readStoreDetailFixedHeaderOffsetPxCached();
          const next = hero ? hero.getBoundingClientRect().bottom <= headerH : false;
          return prev === next ? prev : next;
        });
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [displayHeroSrc, galleryUrls.length]);

  const onMenuSearchFocus = useCallback(() => {
    router.push(`${storeRootHref}?menuSearch=1`, { scroll: false });
  }, [router, storeRootHref]);

  const onCartPreviewClick = useCallback(() => {
    openStoreCartPreview({ storeId, storeSlug });
  }, [storeId, storeSlug]);

  const headerElevated = headerSolid || !heroVisualForHeader;

  return (
    <div className="min-h-[100dvh] bg-white">
      <StoreOrderStickyHeader
        elevated={headerElevated}
        heroGlassOverlayButtons
        fallbackHref={storeRootHref}
        storeSlug={storeSlug}
        storeName={headerTitle}
        commerceCartStoreId={storeId}
        viewerFavorited={false}
        favoriteBusy={false}
        onFavoriteClick={() => {}}
        onMenuSearchFocus={onMenuSearchFocus}
        onShareClick={onShare}
        onCartPreviewClick={onCartPreviewClick}
      />

      <StoreProductDetailHeroMedia
        imageUrl={displayHeroSrc}
        profileFallbackUrl={profileFallbackUrl}
      />

      {galleryUrls.length > 1 ? (
        <HorizontalDragScroll
          className="flex gap-2 overflow-x-auto border-b border-[var(--delivery-border-section)] bg-white px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          aria-label={t("store_product_photos_aria", { title: headerTitle })}
        >
          {galleryFetchUrls.map((u, i) => (
            <button
              key={`${galleryUrls[i] ?? u}-${i}`}
              type="button"
              onClick={() => onGalleryIndexChange(i)}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-[6px] ring-2 ring-offset-1 ${
                i === galleryIndex ? "ring-[color:var(--delivery-primary)]" : "ring-transparent opacity-75"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </HorizontalDragScroll>
      ) : null}

      {children}
    </div>
  );
}
