"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { StoreMenuReviewRailProduct } from "@/lib/stores/build-store-menu-review-rail-products";
import { fetchStoreReviewsPublicDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreReviewsPanelOpenOptions } from "@/lib/stores/store-reviews-panel-open";
import {
  buildStoreReviewPreviewSlides,
  starGlyphs,
  STORE_REVIEW_PREVIEW_CAROUSEL_MS,
  STORE_REVIEW_PREVIEW_ROTATE_MS,
} from "@/lib/stores/store-review-preview-slides";

export type { StoreMenuReviewRailProduct };

type ReviewRow = {
  id: string;
  rating: number;
  content: string;
  product_id?: string | null;
  image_urls?: string[];
};

/**
 * 배민 패턴: 카테고리 탭 상단 — 리뷰 1건 카드(썸네일+별+본문) 우→좌 캐러셀 + 「사진 리뷰 더보기」.
 * 리뷰 0건 → 「리뷰가 없습니다.」
 */
export function StoreMenuReviewFlowLink({
  storeSlug,
  menuProducts,
  onOpenReviews,
}: {
  storeSlug: string;
  menuProducts: StoreMenuReviewRailProduct[];
  onOpenReviews: (opts?: StoreReviewsPanelOpenOptions) => void;
}) {
  const { t } = useI18n();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const pauseUntilRef = useRef(0);

  useEffect(() => {
    if (!storeSlug.trim()) {
      setReviews([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { json } = await fetchStoreReviewsPublicDeduped(storeSlug);
        const j = json as { ok?: boolean; reviews?: ReviewRow[] };
        if (!j?.ok || !Array.isArray(j.reviews)) {
          if (!cancelled) setReviews([]);
          return;
        }
        if (!cancelled) setReviews(j.reviews);
      } catch {
        if (!cancelled) setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const slides = useMemo(
    () => buildStoreReviewPreviewSlides(reviews, menuProducts),
    [reviews, menuProducts]
  );

  const hasPhotoReviews = useMemo(
    () => reviews.some((r) => Array.isArray(r.image_urls) && r.image_urls.length > 0),
    [reviews]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length, storeSlug]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setTransitioning(true);
      setActiveIndex((i) => (i + 1) % slides.length);
      window.setTimeout(() => setTransitioning(false), STORE_REVIEW_PREVIEW_CAROUSEL_MS);
    }, STORE_REVIEW_PREVIEW_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const openFromSlide = useCallback(
    (slide: (typeof slides)[number]) => {
      pauseUntilRef.current = Date.now() + STORE_REVIEW_PREVIEW_ROTATE_MS;
      onOpenReviews({
        productId: slide.productId,
      });
    },
    [onOpenReviews]
  );

  const openPhotoMore = useCallback(() => {
    pauseUntilRef.current = Date.now() + STORE_REVIEW_PREVIEW_ROTATE_MS;
    onOpenReviews({ photoOnly: true });
  }, [onOpenReviews]);

  const openAll = useCallback(() => {
    pauseUntilRef.current = Date.now() + STORE_REVIEW_PREVIEW_ROTATE_MS;
    onOpenReviews({});
  }, [onOpenReviews]);

  if (!storeSlug.trim()) return null;

  const showEmpty = !loading && slides.length === 0;

  return (
    <section
      className="border-b border-[var(--delivery-border-section)] bg-[var(--delivery-bg-card)] px-4 py-2"
      aria-label={t("store_reviews_title")}
      data-store-menu-review-rail
    >
      {loading ? (
        <div className="h-[68px] animate-pulse rounded-[10px] bg-[color:var(--delivery-bg-soft)]" />
      ) : showEmpty ? (
        <div className="flex h-[68px] items-center justify-center rounded-[10px] bg-white ring-1 ring-black/[0.06]">
          <p className="text-[13px] font-semibold text-[color:var(--delivery-text-muted)]">
            {t("store_review_preview_empty")}
          </p>
        </div>
      ) : (
        <div className="flex items-stretch overflow-hidden rounded-[10px] bg-white ring-1 ring-black/[0.06]">
          <button
            type="button"
            className="flex min-w-0 flex-1 touch-manipulation text-left active:bg-[color:var(--delivery-bg-soft)]"
            onClick={() => {
              const slide = slides[activeIndex];
              if (slide) openFromSlide(slide);
            }}
          >
            <div className="relative h-[68px] w-full overflow-hidden">
              <div
                className="flex h-full"
                style={{
                  width: `${slides.length * 100}%`,
                  transform: `translate3d(-${(activeIndex * 100) / slides.length}%, 0, 0)`,
                  transition: transitioning
                    ? `transform ${STORE_REVIEW_PREVIEW_CAROUSEL_MS}ms ease-out`
                    : "none",
                }}
              >
                {slides.map((slide) => (
                  <div
                    key={slide.reviewId}
                    className="flex h-[68px] shrink-0 items-center gap-1.5 p-1.5"
                    style={{ width: `${100 / slides.length}%` }}
                  >
                    {slide.thumbUrl ? (
                      <SamarketThumbnail
                        src={slide.thumbUrl}
                        size={56}
                        roundedClassName="rounded-[8px]"
                        className="shrink-0 bg-[color:var(--delivery-bg-thumb)]"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--delivery-bg-soft)] text-[color:var(--delivery-text-muted)]">
                        ★
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pr-1">
                      <p className="text-[10px] font-bold leading-none text-[color:var(--dibay-gold)]">
                        {starGlyphs(slide.rating)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11.5px] font-bold leading-snug text-[color:var(--delivery-text-main)]">
                        {slide.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </button>

          {hasPhotoReviews ? (
            <button
              type="button"
              onClick={openPhotoMore}
              className="flex w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--delivery-border-section)] bg-[color:var(--delivery-bg-soft)] px-1 text-center text-[10px] font-bold leading-[1.15] text-[color:var(--delivery-text-muted)] touch-manipulation active:bg-[color:var(--delivery-bg-muted)]"
              aria-label={t("store_photo_reviews_more_aria")}
            >
              <span>{t("store_photo_reviews_more_line1")}</span>
              <span>{t("store_photo_reviews_more_line2")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openAll}
              className="flex w-[46px] shrink-0 flex-col items-center justify-center border-l border-[var(--delivery-border-section)] bg-[color:var(--delivery-bg-soft)] px-1 text-center text-[10px] font-bold leading-tight text-[color:var(--delivery-text-muted)] touch-manipulation active:bg-[color:var(--delivery-bg-muted)]"
            >
              {t("store_show_more")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
