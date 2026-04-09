"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreDetailSectionTitle } from "@/components/stores/StoreDetailSectionTitle";
import { STORE_DETAIL_CARD, STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";

type Review = {
  id: string;
  rating: number;
  content: string;
  created_at: string;
  product_id: string | null;
  buyer_public_label?: string;
  image_urls?: string[];
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
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
  const [photoOnly, setPhotoOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"recommended" | "latest" | "rating_desc" | "rating_asc">(
    "recommended"
  );

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

  const ratingDist = useMemo(() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      const n = Math.max(1, Math.min(5, Math.floor(Number(r.rating) || 0)));
      dist[n] = (dist[n] ?? 0) + 1;
    }
    return dist;
  }, [reviews]);

  const ownerReplyCount = useMemo(
    () => reviews.filter((r) => Boolean(r.owner_reply_content?.trim())).length,
    [reviews]
  );

  const filteredReviews = useMemo(() => {
    const base = photoOnly
      ? reviews.filter((r) => Array.isArray(r.image_urls) && r.image_urls.length > 0)
      : reviews;
    const copied = [...base];
    if (sortBy === "latest") {
      copied.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      return copied;
    }
    if (sortBy === "rating_desc") {
      copied.sort((a, b) => {
        const rd = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (rd !== 0) return rd;
        return +new Date(b.created_at) - +new Date(a.created_at);
      });
      return copied;
    }
    if (sortBy === "rating_asc") {
      copied.sort((a, b) => {
        const rd = (Number(a.rating) || 0) - (Number(b.rating) || 0);
        if (rd !== 0) return rd;
        return +new Date(b.created_at) - +new Date(a.created_at);
      });
      return copied;
    }
    copied.sort((a, b) => {
      const rd = (Number(b.rating) || 0) - (Number(a.rating) || 0);
      if (rd !== 0) return rd;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return copied;
  }, [photoOnly, reviews, sortBy]);

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
      <div className={`${STORE_DETAIL_CARD} p-3`}>
        <div className="flex items-end justify-between gap-2">
          <div>
            <StoreDetailSectionTitle level="h2">리뷰 {count.toLocaleString("ko-KR")}</StoreDetailSectionTitle>
            <p className="mt-0.5 text-[13px] text-stone-500">사장님 댓글 {ownerReplyCount.toLocaleString("ko-KR")}</p>
          </div>
          <div className="text-right">
            <p className="text-[34px] font-bold leading-none text-stone-900">{avg != null ? avg.toFixed(2) : "—"}</p>
            <p className="mt-1 text-[14px] text-amber-500">★★★★★</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = ratingDist[star] ?? 0;
            const pct = count > 0 ? Math.round((n / count) * 1000) / 10 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="w-5 text-[12px] font-semibold text-stone-700">{star}점</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-[12px] text-stone-500">{n.toLocaleString("ko-KR")}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-signature focus:ring-signature"
            checked={photoOnly}
            onChange={(e) => setPhotoOnly(e.target.checked)}
          />
          사진 리뷰만
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-ui-rect border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] text-stone-700"
        >
          <option value="recommended">추천순</option>
          <option value="latest">최신순</option>
          <option value="rating_desc">별점 높은순</option>
          <option value="rating_asc">별점 낮은순</option>
        </select>
      </div>

      {filteredReviews.length === 0 ? (
        <div className={`${STORE_DETAIL_CARD} p-4`}>
          <p className="text-[14px] text-stone-500">조건에 맞는 리뷰가 없습니다.</p>
        </div>
      ) : null}

      <ul className="space-y-2.5">
        {filteredReviews.map((r) => (
          <li key={r.id} className={`${STORE_DETAIL_CARD} p-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-stone-700">
                {r.buyer_public_label || "사마켓 회원"}
              </p>
              <p className="text-[12px] font-normal text-stone-400">
                {new Date(r.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <p className="mt-1 text-[14px] text-amber-600">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            {r.image_urls && r.image_urls.length > 0 ? (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {r.image_urls.slice(0, 5).map((src) => (
                  <div
                    key={src}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect border border-stone-100 bg-stone-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] font-normal leading-relaxed text-stone-900">
              {r.content}
            </p>
            {r.owner_reply_content?.trim() ? (
              <div className="mt-2 rounded-ui-rect border border-stone-200 bg-stone-50 px-2.5 py-2">
                <p className="text-[12px] font-semibold text-stone-700">사장님 댓글</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-stone-800">
                  {r.owner_reply_content.trim()}
                </p>
                {r.owner_reply_created_at ? (
                  <p className="mt-1 text-right text-[11px] text-stone-400">
                    {new Date(r.owner_reply_created_at).toLocaleDateString("ko-KR")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
