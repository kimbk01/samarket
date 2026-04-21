"use client";

import { useEffect, useRef, useState } from "react";
import { FavoriteToggleButton } from "@/components/favorites/FavoriteToggleButton";

export interface ProductDetailHeaderToolbarProps {
  productId: string;
  onReport?: () => void;
  hideFavorite?: boolean;
}

/** 상품 상세 우측 액션 — 전역 1단 `rightSlot`용 */
export function ProductDetailHeaderToolbar({
  productId,
  onReport,
  hideFavorite = false,
}: ProductDetailHeaderToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [moreOpen]);

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: document.title || "상품",
          url: window.location.href,
        })
        .catch(() => {
          try {
            navigator.clipboard.writeText(window.location.href);
          } catch {
            /* ignore */
          }
        });
    } else {
      try {
        navigator.clipboard?.writeText(window.location.href);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="flex items-center gap-0.5 pr-0.5">
      <button
        type="button"
        onClick={handleShare}
        className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
        aria-label="공유"
      >
        <ShareIcon className="h-5 w-5" />
      </button>
      {!hideFavorite ? <FavoriteToggleButton productId={productId} iconClassName="h-5 w-5" /> : null}
      <div className="relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
          aria-label="더보기"
        >
          <MoreIcon className="h-5 w-5" />
        </button>
        {moreOpen && onReport ? (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] py-1 shadow-sam-elevated">
            <button
              type="button"
              onClick={() => {
                onReport();
                setMoreOpen(false);
              }}
              className="block w-full px-4 py-2.5 text-left sam-text-body text-foreground hover:bg-sam-primary-soft"
            >
              상품 신고
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}
