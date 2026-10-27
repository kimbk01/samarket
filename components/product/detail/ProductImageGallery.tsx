"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { imageResolveTradePostDetailDisplayUrl } from "@/lib/image";

import { useState, useRef, useCallback } from "react";
import { PostImageViewer } from "@/components/common/media/PostImageViewer";
import { TradeNoPhotoPlaceholder } from "@/components/trade/media/TradeNoPhotoPlaceholder";

interface ProductImageGalleryProps {
  images: string[];
  title: string;
}

/**
 * 거래 상세 히어로 — crop 금지, 전체 이미지 표시(contain).
 * P-4 (I1·I7·I13): 높이 고정(사진 비율마다 출렁이지 않음) · 로딩 대각선 shimmer · 변형본 실패 시 원본 재시도 →
 * 그래도 실패하면 「사진을 불러오지 못했어요」 · 사진을 누르면 전체화면 보기(스와이프·핀치 확대·n/N·닫기).
 */
export function ProductImageGallery({ images, title }: ProductImageGalleryProps) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const list = images.length > 0 ? images : [""];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  /** 슬라이드별 상태: 0 변형본 · 1 원본 재시도 · 2 실패 */
  const [attempt, setAttempt] = useState<Record<number, 0 | 1 | 2>>({});
  const [loadedIdx, setLoadedIdx] = useState<Record<number, true>>({});

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
        {list.map((src, i) => {
          const stage = attempt[i] ?? 0;
          const displaySrc = stage === 0 ? imageResolveTradePostDetailDisplayUrl(src) : src;
          return (
            <div
              key={i}
              className="relative flex h-[min(100vw,70vh,520px)] min-w-full w-full shrink-0 snap-start snap-always items-center justify-center"
            >
              {!src ? (
                <TradeNoPhotoPlaceholder />
              ) : stage === 2 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-sam-surface-muted text-sm text-sam-meta">
                  {t("trade_photo_load_failed")}
                </div>
              ) : (
                <>
                  {loadedIdx[i] ? null : <div className="sam-shimmer" aria-hidden />}
                  <button
                    type="button"
                    className="relative block h-full w-full"
                    onClick={() => setViewerIndex(i)}
                    aria-label={title ? `${title} - ${i + 1}` : `${i + 1}`}
                  >
                    <img
                      src={displaySrc}
                      alt={title ? `${title} - ${i + 1}` : ""}
                      className="block h-full w-full object-contain object-center"
                      draggable={false}
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : "auto"}
                      decoding="async"
                      onLoad={() => setLoadedIdx((prev) => (prev[i] ? prev : { ...prev, [i]: true }))}
                      onError={() =>
                        setAttempt((prev) => ({
                          ...prev,
                          [i]: stage === 0 && displaySrc !== src ? 1 : 2,
                        }))
                      }
                    />
                  </button>
                </>
              )}
            </div>
          );
        })}
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
      <PostImageViewer
        open={viewerIndex !== null && images.length > 0}
        urls={images}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
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
