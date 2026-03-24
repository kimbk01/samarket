"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreDetailSectionTitle } from "@/components/stores/StoreDetailSectionTitle";
import { STORE_DETAIL_CARD, STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";

type Review = {
  id: string;
  rating: number;
  content: string;
  created_at: string;
  product_id: string | null;
};

export function StoreReviewsSection({
  storeSlug,
  variant = "plain",
}: {
  storeSlug: string;
  variant?: "card" | "plain";
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(storeSlug)}/reviews`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.reviews)) {
          setReviews(json.reviews);
          setAvg(typeof json.avg_rating === "number" ? json.avg_rating : null);
          setCount(Number(json.count) || 0);
        }
      } catch {
        if (!silent) setReviews([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [storeSlug]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const wrapPlain = (body: ReactNode) => (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 space-y-3 pb-2`}>{body}</div>
  );

  const wrapCard = (body: ReactNode) => (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} space-y-3 p-4`}>{body}</div>
  );

  const wrap = variant === "plain" ? wrapPlain : wrapCard;

  if (loading) {
    return wrap(
      <>
        <StoreDetailSectionTitle level="h2">리뷰</StoreDetailSectionTitle>
        <p className="text-[13px] font-normal text-stone-400">리뷰 불러오는 중…</p>
      </>
    );
  }

  if (count === 0) {
    return wrap(
      <>
        <StoreDetailSectionTitle level="h2">리뷰</StoreDetailSectionTitle>
        {variant === "plain" ? (
          <div className={`${STORE_DETAIL_CARD} p-4`}>
            <p className="text-[14px] font-normal leading-relaxed text-stone-500">
              아직 등록된 리뷰가 없습니다.
            </p>
          </div>
        ) : (
          <p className="text-[14px] font-normal leading-relaxed text-stone-500">
            아직 등록된 리뷰가 없습니다.
          </p>
        )}
      </>
    );
  }

  return wrap(
    <>
      <div className="space-y-1">
        <StoreDetailSectionTitle level="h2">리뷰</StoreDetailSectionTitle>
        {avg != null ? (
          <p className="text-[14px] font-semibold text-stone-700">
            평균 <span className="text-amber-600">★ {avg.toFixed(2)}</span>
            <span className="font-normal text-stone-500"> ({count})</span>
          </p>
        ) : null}
      </div>
      <ul className="space-y-2.5">
        {reviews.map((r) => (
          <li key={r.id} className={`${STORE_DETAIL_CARD} p-3`}>
            <p className="text-[14px] text-amber-600">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] font-normal leading-relaxed text-stone-900">
              {r.content}
            </p>
            <p className="mt-1 text-[12px] font-normal text-stone-400">
              {new Date(r.created_at).toLocaleDateString("ko-KR")}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
