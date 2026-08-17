"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { imageResolveTradePostDetailDisplayUrl } from "@/lib/image";

import { useState, useRef, useCallback } from "react";

interface ProductImageGalleryProps {
  images: string[];
  title: string;
}

/** 거래 상세 히어로 — crop 금지, 전체 이미지 표시(contain / width 100% · height auto · max-height 420px) */
export function ProductImageGallery({ images, title }: ProductImageGalleryProps) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const list = images.length > 0 ? images : [""];

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || list.length <= 1) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setCurrent(Math.min(index, list.length - 1));
  }, [list.length]);

  const goTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ left: el.clientWidth * index, behavior: "smooth" });
    }
    setCurrent(index);
  }, []);

  const goPrev = useCallback(() => {
    if (current > 0) goTo(current - 1);
  }, [current, goTo]);

  const goNext = useCallback(() => {
    if (current < list.length - 1) goTo(current + 1);
  }, [current, list.length, goTo]);

  return (
    <div className="relative flex w-full items-center justify-center overflow-hidden bg-sam-surface-muted">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full touch-pan-x overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {list.map((src, i) => (
          <div
            key={i}
            className="flex min-w-full w-full shrink-0 snap-start snap-always items-center justify-center"
          >
            {src ? (
              <img
                src={imageResolveTradePostDetailDisplayUrl(src)}
                alt={title ? `${title} - ${i + 1}` : ""}
                className="block h-auto w-full max-h-[min(70vh,520px)] object-contain object-center"
                draggable={false}
              />
            ) : (
              <div className="flex min-h-[160px] w-full items-center justify-center bg-sam-surface-muted text-sm text-sam-meta">
                {t("ui_product_gallery_fallback")}
              </div>
            )}
          </div>
        ))}
      </div>

      {list.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={current === 0}
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white shadow transition hover:bg-black/55 disabled:invisible"
            aria-label={t("ui_product_gallery_prev_aria")}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={current === list.length - 1}
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white shadow transition hover:bg-black/55 disabled:invisible"
            aria-label={t("ui_product_gallery_next_aria")}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-2 right-2 z-10 rounded bg-black/50 px-2 py-1 sam-text-helper font-medium text-white">
            {current + 1}/{list.length}
          </div>
        </>
      )}
    </div>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
