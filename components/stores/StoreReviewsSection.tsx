"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAppDate, formatAppNumber } from "@/lib/i18n/locale-for-app-language";

import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreDetailSectionTitle } from "@/components/stores/StoreDetailSectionTitle";
import { STORE_ORDER_BRAND } from "@/components/stores/store-order-detail/store-order-brand";
import { STORE_DETAIL_CARD, STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";
import {
  fetchStoreReviewsPublicDeduped,
  fetchStoreReviewsSummaryDeduped,
} from "@/lib/stores/store-delivery-api-client";
import { Sam } from "@/lib/ui/sam-component-classes";

function ReviewOrderDetailShimmer() {
  const Bar = ({ className }: { className: string }) => (
    <div
      className={`animate-pulse bg-gradient-to-r from-neutral-200/80 via-neutral-100/90 to-neutral-200/80 bg-[length:200%_100%] ${className}`}
      style={{ animationDuration: "1.2s" }}
    />
  );
  return (
    <>
      <div className="rounded-[16px] bg-white p-4 shadow-sm ring-1 ring-neutral-100/80">
        <Bar className="h-10 w-[4.5rem] rounded-[10px]" />
        <Bar className="mt-4 h-3.5 max-w-[12rem] rounded" />
        <Bar className="mt-6 h-2 w-full rounded-full" />
        <Bar className="mt-2 h-2 w-[88%] rounded-full" />
        <Bar className="mt-2 h-2 w-[72%] rounded-full" />
      </div>
      <Bar className="h-[112px] w-full rounded-[16px]" />
      <Bar className="h-[112px] w-full rounded-[16px]" />
    </>
  );
}

type Review = {
  id: string;
  rating: number;
  content: string;
  created_at: string;
  product_id: string | null;
  buyer_public_label?: string;
  image_urls?: string[];
  item_feedback?: Record<string, "up" | "down"> | null;
  order_type?: "delivery" | "pickup" | null;
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
};

export function StoreReviewsSection({
  storeSlug,
  variant = "plain",
  surface = "default",
}: {
  storeSlug: string;
  variant?: "card" | "plain";
  surface?: "default" | "orderDetail";
}) {
  const { t, language } = useI18n();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  });
  const [loading, setLoading] = useState(true);
  const [photoOnly, setPhotoOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"recommended" | "latest" | "rating_desc" | "rating_asc">(
    "recommended"
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading((prev) => (prev ? prev : true));
      try {
        const [reviewsRes, summaryRes] = await Promise.all([
          fetchStoreReviewsPublicDeduped(storeSlug),
          fetchStoreReviewsSummaryDeduped(storeSlug),
        ]);
        const j = reviewsRes.json as {
          ok?: boolean;
          reviews?: Review[];
          avg_rating?: number;
          count?: unknown;
        };
        if (j?.ok && Array.isArray(j.reviews)) {
          setReviews(j.reviews);
          setAvg(typeof j.avg_rating === "number" ? j.avg_rating : null);
          setCount(Number(j.count) || 0);
        }
        // 분포는 summary API에서 가져옴 (전체 집계 기반, 50건 제한 없음)
        const sj = summaryRes.json as {
          ok?: boolean;
          avg_rating?: number;
          count?: number;
          distribution?: Record<string, number>;
        };
        if (sj?.ok) {
          if (typeof sj.avg_rating === "number") setAvg(sj.avg_rating);
          if (typeof sj.count === "number") setCount(sj.count);
          if (sj.distribution && typeof sj.distribution === "object") {
            setDistribution({
              1: Number(sj.distribution["1"]) || 0,
              2: Number(sj.distribution["2"]) || 0,
              3: Number(sj.distribution["3"]) || 0,
              4: Number(sj.distribution["4"]) || 0,
              5: Number(sj.distribution["5"]) || 0,
            });
          }
        }
      } catch {
        if (!silent) setReviews((prev) => (prev.length === 0 ? prev : []));
      } finally {
        if (!silent) setLoading((prev) => (prev ? false : prev));
      }
    },
    [storeSlug]
  );

  useLayoutEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const wrapPlain = (body: ReactNode) => (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 space-y-3 pb-2`}>{body}</div>
  );

  const wrapCard = (body: ReactNode) => (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} space-y-3 p-4`}>{body}</div>
  );

  const wrapOrderDetail = (body: ReactNode) => <div className="mt-3 space-y-3 pb-2">{body}</div>;

  const wrap =
    surface === "orderDetail" ? wrapOrderDetail : variant === "plain" ? wrapPlain : wrapCard;

  // distribution은 summary API에서 가져온 전체 집계 (state에서 직접 사용)

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

  const photoReviewThumbUrls = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of reviews) {
      const imgs = Array.isArray(r.image_urls) ? r.image_urls : [];
      for (const raw of imgs) {
        const u = String(raw).trim();
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= 24) return out;
      }
    }
    return out;
  }, [reviews]);

  if (loading) {
    if (surface === "orderDetail") {
      return wrapOrderDetail(<ReviewOrderDetailShimmer />);
    }
    return wrap(
      <>
        <StoreDetailSectionTitle level="h2">{t("store_reviews_title")}</StoreDetailSectionTitle>
        <p className={Sam.text.bodySecondary}>{t("store_reviews_loading")}</p>
      </>
    );
  }

  if (count === 0) {
    if (surface === "orderDetail") {
      return wrapOrderDetail(
        <div className="rounded-[16px] bg-white px-4 py-10 text-center shadow-sm ring-1 ring-neutral-100/80">
          <p className="text-[14px] leading-relaxed" style={{ color: STORE_ORDER_BRAND.secondary }}>
            {t("store_no_reviews_yet")}
          </p>
        </div>
      );
    }
    return wrap(
      <>
        <StoreDetailSectionTitle level="h2">{t("store_reviews_title")}</StoreDetailSectionTitle>
        {variant === "plain" ? (
          <div className={`${STORE_DETAIL_CARD} p-4`}>
            <p className={`${Sam.text.body} text-sam-muted`}>{t("store_no_reviews_yet")}</p>
          </div>
        ) : (
          <p className={`${Sam.text.body} text-sam-muted`}>{t("store_no_reviews_yet")}</p>
        )}
      </>
    );
  }

  if (surface === "orderDetail") {
    return wrapOrderDetail(
      <>
        <div className="rounded-[16px] bg-white p-4 shadow-sm ring-1 ring-neutral-100/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[22px] font-bold leading-none tabular-nums" style={{ color: STORE_ORDER_BRAND.title }}>
                {avg != null ? avg.toFixed(1) : "—"}
              </p>
              <p className="mt-2 text-[12px] font-medium" style={{ color: STORE_ORDER_BRAND.secondary }}>
                {t("store_reviews_total", { count: formatAppNumber(count, language) })}
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: STORE_ORDER_BRAND.secondary }}>
                {t("store_owner_reply_count", { count: formatAppNumber(ownerReplyCount, language) })}
              </p>
            </div>
            <p className="text-[13px] font-semibold leading-none" style={{ color: STORE_ORDER_BRAND.star }}>
              ★★★★★
            </p>
          </div>
          <div className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = distribution[star] ?? 0;
              const pct = count > 0 ? Math.round((n / count) * 1000) / 10 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span
                    className="w-5 text-[12px] font-semibold tabular-nums"
                    style={{ color: STORE_ORDER_BRAND.title }}
                  >
                    {star}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: STORE_ORDER_BRAND.star }}
                    />
                  </div>
                  <span
                    className="w-8 text-right text-[12px] tabular-nums"
                    style={{ color: STORE_ORDER_BRAND.secondary }}
                  >
                    {formatAppNumber(n, language)}
                  </span>
                </div>
              );
            })}
          </div>
          {photoReviewThumbUrls.length > 0 ? (
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="mb-2 text-[12px] font-bold" style={{ color: STORE_ORDER_BRAND.title }}>
                {t("store_photo_reviews")}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
                {photoReviewThumbUrls.map((src) => (
                  <div
                    key={src}
                    className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[12px] ring-1 ring-neutral-100/90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <label
            className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold"
            style={{ color: STORE_ORDER_BRAND.title }}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300"
              style={{ accentColor: STORE_ORDER_BRAND.accent }}
              checked={photoOnly}
              onChange={(e) => setPhotoOnly(e.target.checked)}
            />
            {t("store_photo_reviews_only")}
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-[13px] font-semibold outline-none"
            style={{ color: STORE_ORDER_BRAND.title }}
          >
            <option value="recommended">{t("store_sort_recommended")}</option>
            <option value="latest">{t("store_sort_latest")}</option>
            <option value="rating_desc">{t("store_sort_rating_high")}</option>
            <option value="rating_asc">{t("store_sort_rating_low")}</option>
          </select>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="rounded-[16px] bg-white px-4 py-8 text-center shadow-sm ring-1 ring-neutral-100/80">
            <p className="text-[13px] leading-relaxed" style={{ color: STORE_ORDER_BRAND.secondary }}>
              {t("store_no_matching_reviews")}
            </p>
          </div>
        ) : null}

        <ul className="space-y-2.5">
          {filteredReviews.map((r) => (
            <li
              key={r.id}
              className="rounded-[16px] bg-white p-4 shadow-sm ring-1 ring-neutral-100/80"
            >
              {/* 헤더: 작성자 + 날짜 + 신고 */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="min-w-0 truncate text-[13px] font-semibold leading-snug"
                    style={{ color: STORE_ORDER_BRAND.title }}
                  >
                    {r.buyer_public_label || t("store_member_fallback")}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-medium leading-snug text-amber-500">
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </span>
                    {r.order_type === "delivery" ? (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-600">
                        {t("store_order_type_delivery")}
                      </span>
                    ) : r.order_type === "pickup" ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-600">
                        {t("store_order_type_pickup")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-[12px] leading-snug tabular-nums" style={{ color: STORE_ORDER_BRAND.secondary }}>
                    {formatAppDate(r.created_at, language)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt(t("store_review_report_prompt") ?? "신고 사유를 입력해주세요");
                      if (reason && reason.trim()) {
                        fetch("/api/me/store-reviews/report", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ review_id: r.id, reason: reason.trim() }),
                        }).catch(() => null);
                        alert(t("store_review_report_submitted") ?? "신고가 접수되었습니다.");
                      }
                    }}
                    className="text-[11px]"
                    style={{ color: STORE_ORDER_BRAND.muted }}
                    aria-label={t("store_review_report_aria") ?? "신고하기"}
                  >
                    {t("store_review_report_btn")}
                  </button>
                </div>
              </div>
              {r.image_urls && r.image_urls.length > 0 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {r.image_urls.slice(0, 5).map((src) => (
                    <div
                      key={src}
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-[12px] ring-1 ring-neutral-100/90"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
              <p
                className="mt-2 whitespace-pre-wrap text-[13px] font-normal leading-relaxed"
                style={{ color: STORE_ORDER_BRAND.title }}
              >
                {r.content}
              </p>
              {/* 메뉴별 평가 태그 */}
              {r.item_feedback && Object.keys(r.item_feedback).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(r.item_feedback).map(([itemId, v]) =>
                    v === "up" ? (
                      <span key={`${r.id}-${itemId}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        👍 {t("store_review_menu_good")}
                      </span>
                    ) : (
                      <span key={`${r.id}-${itemId}`} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                        👎 {t("store_review_menu_bad")}
                      </span>
                    )
                  )}
                </div>
              ) : null}
              {r.owner_reply_content?.trim() ? (
                <div
                  className="mt-3 rounded-[12px] px-3 py-2.5"
                  style={{ backgroundColor: STORE_ORDER_BRAND.frameGray }}
                >
                  <p className="text-[12px] font-bold" style={{ color: STORE_ORDER_BRAND.title }}>
                    {t("store_owner_reply")}
                  </p>
                  <p
                    className="mt-1 whitespace-pre-wrap text-[13px] leading-snug"
                    style={{ color: STORE_ORDER_BRAND.secondary }}
                  >
                    {r.owner_reply_content.trim()}
                  </p>
                  {r.owner_reply_created_at ? (
                    <p className="mt-1 text-right text-[12px] tabular-nums" style={{ color: STORE_ORDER_BRAND.muted }}>
                      {formatAppDate(r.owner_reply_created_at, language)}
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

  return wrap(
    <>
      <div className={`${STORE_DETAIL_CARD} p-3`}>
        <div className="flex items-end justify-between gap-2">
          <div>
            <StoreDetailSectionTitle level="h2">
              {t("store_reviews_with_count", { count: formatAppNumber(count, language) })}
            </StoreDetailSectionTitle>
            <p className={`mt-0.5 ${Sam.text.bodySecondary}`}>
              {t("store_owner_reply_count", { count: formatAppNumber(ownerReplyCount, language) })}
            </p>
          </div>
          <div className="text-right">
            <p className={`${Sam.text.hero} leading-none text-sam-fg`}>{avg != null ? avg.toFixed(2) : "—"}</p>
            <p className={`mt-1 ${Sam.text.body} text-amber-500`}>★★★★★</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = distribution[star] ?? 0;
            const pct = count > 0 ? Math.round((n / count) * 1000) / 10 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className={`w-5 font-semibold text-sam-fg ${Sam.text.helper}`}>{t("store_star_points", { star })}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-sam-border-soft">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className={`w-10 text-right text-sam-muted ${Sam.text.helper}`}>
                  {formatAppNumber(n, language)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className={`inline-flex items-center gap-2 font-medium text-sam-fg ${Sam.text.bodySecondary}`}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-sam-border text-signature focus:ring-signature"
            checked={photoOnly}
            onChange={(e) => setPhotoOnly(e.target.checked)}
          />
          {t("store_photo_reviews_only")}
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className={`rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg ${Sam.text.bodySecondary}`}
        >
          <option value="recommended">{t("store_sort_recommended")}</option>
          <option value="latest">{t("store_sort_latest")}</option>
          <option value="rating_desc">{t("store_sort_rating_high")}</option>
          <option value="rating_asc">{t("store_sort_rating_low")}</option>
        </select>
      </div>

      {filteredReviews.length === 0 ? (
        <div className={`${STORE_DETAIL_CARD} p-4`}>
          <p className={`${Sam.text.body} text-sam-muted`}>{t("store_no_matching_reviews")}</p>
        </div>
      ) : null}

      <ul className="space-y-2.5">
        {filteredReviews.map((r) => (
          <li key={r.id} className={`${STORE_DETAIL_CARD} p-3`}>
            {/* 헤더: 작성자 + 날짜 + 신고 */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold text-sam-fg ${Sam.text.bodySecondary}`}>
                  {r.buyer_public_label || t("store_member_fallback")}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className={`text-amber-600 ${Sam.text.body}`}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                  {r.order_type === "delivery" ? (
                    <span className={`rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600 ${Sam.text.xxs}`}>
                      {t("store_order_type_delivery")}
                    </span>
                  ) : r.order_type === "pickup" ? (
                    <span className={`rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-600 ${Sam.text.xxs}`}>
                      {t("store_order_type_pickup")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className={`text-sam-meta ${Sam.text.xxs}`}>
                  {formatAppDate(r.created_at, language)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt(t("store_review_report_prompt") ?? "신고 사유를 입력해주세요");
                    if (reason && reason.trim()) {
                      fetch("/api/me/store-reviews/report", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ review_id: r.id, reason: reason.trim() }),
                      }).catch(() => null);
                      alert(t("store_review_report_submitted") ?? "신고가 접수되었습니다.");
                    }
                  }}
                  className={`text-sam-meta hover:text-sam-muted ${Sam.text.xxs}`}
                  aria-label={t("store_review_report_aria") ?? "신고하기"}
                >
                  {t("store_review_report_btn")}
                </button>
              </div>
            </div>

            {/* 이미지 가로 스크롤 */}
            {r.image_urls && r.image_urls.length > 0 ? (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {r.image_urls.slice(0, 5).map((src) => (
                  <div
                    key={src}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}

            {/* 리뷰 본문 */}
            <p className={`mt-1.5 whitespace-pre-wrap text-sam-fg ${Sam.text.body}`}>
              {r.content}
            </p>

            {/* 메뉴별 평가 태그 (item_feedback) */}
            {r.item_feedback && Object.keys(r.item_feedback).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(r.item_feedback).map(([itemId, v]) =>
                  v === "up" ? (
                    <span
                      key={`${r.id}-${itemId}`}
                      className={`rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ${Sam.text.xxs}`}
                    >
                      👍 {t("store_review_menu_good")}
                    </span>
                  ) : (
                    <span
                      key={`${r.id}-${itemId}`}
                      className={`rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 ${Sam.text.xxs}`}
                    >
                      👎 {t("store_review_menu_bad")}
                    </span>
                  )
                )}
              </div>
            ) : null}

            {/* 사장님 댓글 */}
            {r.owner_reply_content?.trim() ? (
              <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2">
                <p className={`font-semibold text-sam-fg ${Sam.text.helper}`}>{t("store_owner_reply")}</p>
                <p className={`mt-1 whitespace-pre-wrap text-sam-fg ${Sam.text.bodySecondary}`}>
                  {r.owner_reply_content.trim()}
                </p>
                {r.owner_reply_created_at ? (
                  <p className={`mt-1 text-right text-sam-meta ${Sam.text.xxs}`}>
                    {formatAppDate(r.owner_reply_created_at, language)}
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
