"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { fetchStoreReviewsPublicDeduped } from "@/lib/stores/store-delivery-api-client";

type ReviewCard = {
  id: string;
  rating: number;
  content: string;
  image_urls?: string[];
};

/**
 * 배달앱 패턴: 메뉴 상단 피드에 노출되는 리뷰 진입 줄(탭 없이 본문 흐름).
 * 리뷰가 0건이면 렌더하지 않음 → `/stores/[slug]/reviews` 로 이동.
 */
export function StoreMenuReviewFlowLink({
  storeSlug,
  reviewCount,
  ratingAvg,
}: {
  storeSlug: string;
  reviewCount: number;
  ratingAvg: number | null;
}) {
  const { t, language } = useI18n();
  const n = Number.isFinite(reviewCount) ? Math.floor(reviewCount) : 0;
  const [reviews, setReviews] = useState<ReviewCard[]>([]);

  useEffect(() => {
    if (n <= 0 || !storeSlug) {
      setReviews([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { json } = await fetchStoreReviewsPublicDeduped(storeSlug);
        const j = json as { ok?: boolean; reviews?: ReviewCard[] };
        if (!j?.ok || !Array.isArray(j.reviews)) return;
        if (!cancelled) {
          setReviews(
            j.reviews
              .filter((r) => String(r.content ?? "").trim())
              .slice(0, 6)
          );
        }
      } catch {
        if (!cancelled) setReviews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [n, storeSlug]);

  if (n <= 0) return null;

  const label =
    ratingAvg != null && Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : "—";

  const href = `/stores/${encodeURIComponent(storeSlug)}/reviews`;

  return (
    <section className="border-b border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] py-2" aria-label={t("store_reviews_title")}>
      <div className="mb-1.5 flex items-center justify-between px-4">
        <p className="text-[12px] font-extrabold text-[color:var(--delivery-text-main)]">
          <span className="text-[color:var(--dibay-gold)]">★★★★★</span>{" "}
          <span className="tabular-nums">{label}</span>
        </p>
        <Link href={href} className="text-[11px] font-bold text-[color:var(--delivery-text-muted)]">
          {t("store_reviews_with_count", {
            count: n.toLocaleString(language === "ko" ? "ko-KR" : "en-US"),
          })}{" "}
          ›
        </Link>
      </div>
      {reviews.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {reviews.map((r) => {
            const src = Array.isArray(r.image_urls) ? r.image_urls.find((u) => String(u).trim()) : "";
            return (
              <Link
                key={r.id}
                href={href}
                className="flex h-[68px] w-[220px] shrink-0 gap-1.5 rounded-[8px] bg-[color:var(--delivery-bg-soft)] p-1.5 active:bg-[color:var(--delivery-bg-muted)]"
              >
                {src ? (
                  <SamarketThumbnail src={src} size={56} roundedClassName="rounded-[7px]" className="bg-[color:var(--delivery-bg-thumb)]" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold leading-none text-[color:var(--dibay-gold)]">
                    {"★".repeat(Math.max(1, Math.min(5, Math.floor(Number(r.rating) || 5))))}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] font-bold leading-snug text-[color:var(--delivery-text-main)]">
                    {r.content}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
