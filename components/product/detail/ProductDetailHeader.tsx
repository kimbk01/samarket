"use client";

import { useRef, useState, useEffect } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { FavoriteToggleButton } from "@/components/favorites/FavoriteToggleButton";

interface ProductDetailHeaderProps {
  /** 상품 ID (찜용) */
  productId: string;
  /** 상품 신고 (더보기 메뉴) */
  onReport?: () => void;
  /** 판매자 본인이면 상단 찜 버튼 숨김 */
  hideFavorite?: boolean;
  /** 당근형: 상단 좌측 뒤로가기만, 우측 공유/찜/더보기 */
}

export function ProductDetailHeader({ productId, onReport, hideFavorite = false }: ProductDetailHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      navigator.share({
        title: document.title || "상품",
        url: window.location.href,
      }).catch(() => {
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
    <header
      className={`sticky top-0 z-20 flex h-14 items-center justify-between px-4 transition-all ${
        scrolled ? "border-b border-gray-200 bg-white shadow-sm" : "bg-transparent"
      }`}
    >
      <AppBackButton
        className={
          scrolled
            ? undefined
            : "text-white drop-shadow-sm hover:bg-white/15"
        }
      />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleShare}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-black/10"
          aria-label="공유"
        >
          <ShareIcon className="h-5 w-5" />
        </button>
        {!hideFavorite && <FavoriteToggleButton productId={productId} iconClassName="h-5 w-5" />}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-500 hover:bg-black/10"
            aria-label="더보기"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
          {moreOpen && onReport && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  onReport();
                  setMoreOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
              >
                상품 신고
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
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
