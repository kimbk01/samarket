"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchStoreReviewsSummaryDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  parseStoreReviewsSummaryPayload,
  type StoreReviewsSummaryRecentItem,
} from "@/lib/stores/store-detail-split-types";
import {
  dibayDeliveryDetailPhase2Log,
  dibayDeliveryDetailPhase2SinceMountOrNav,
} from "@/lib/dibay/delivery-detail-phase2-trace";
import { logDeliveryFetchTrace } from "@/lib/dibay/delivery-waterfall-trace";

function starsLabel(rating: number): string {
  const n = Math.min(5, Math.max(0, Math.round(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function StoreDetailDeferredInfoSection({
  storeSlug,
  storeRootPath,
  legacyReviewCount,
  reviewTopSlot,
}: {
  storeSlug: string;
  storeRootPath: string;
  /** 레거시 매장 행 기준 — 요약 API 실패 시 전체 리뷰 링크 노출 여부 */
  legacyReviewCount: number;
  /** 리뷰 블록 위 — `review_top` 매장 공지 */
  reviewTopSlot?: ReactNode;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [payload, setPayload] = useState<{
    avg: number | null;
    count: number;
    recent: StoreReviewsSummaryRecentItem[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!storeSlug.trim()) return;
    dibayDeliveryDetailPhase2Log("reviews_summary_fetch_start", {
      slug: storeSlug.trim(),
      ...dibayDeliveryDetailPhase2SinceMountOrNav(null),
    });
    logDeliveryFetchTrace({
      api: `/api/stores/${storeSlug.trim()}/reviews-summary`,
      component: "StoreDetailDeferredInfoSection",
      reason: "deferred_mount",
    });
    setPhase("loading");
    try {
      const { status, json } = await fetchStoreReviewsSummaryDeduped(storeSlug);
      dibayDeliveryDetailPhase2Log("reviews_summary_fetch_end", {
        slug: storeSlug.trim(),
        status,
        ...dibayDeliveryDetailPhase2SinceMountOrNav(null),
      });
      const p = parseStoreReviewsSummaryPayload(json);
      if (status === 200 && p.ok) {
        const cnt = Number.isFinite(Number(p.count)) ? Math.max(0, Math.floor(Number(p.count))) : 0;
        const avg =
          p.avg_rating === null || p.avg_rating === undefined || Number.isNaN(Number(p.avg_rating))
            ? null
            : Number(p.avg_rating);
        setPayload({
          avg,
          count: cnt,
          recent: Array.isArray(p.recent) ? p.recent : [],
        });
        setPhase("ready");
      } else {
        setPayload(null);
        setPhase("failed");
      }
    } catch {
      setPayload(null);
      setPhase("failed");
    }
  }, [storeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewsHref = `${storeRootPath}/reviews`;
  const showFullLink =
    (payload && payload.count > 0) || legacyReviewCount > 0;

  if (phase === "loading" || phase === "idle") {
    return (
      <>
        {reviewTopSlot ? <div className="mx-4 mt-4">{reviewTopSlot}</div> : null}
        <div className="mx-4 mt-4 rounded-[14px] border border-neutral-100 bg-neutral-50/80 px-4 py-3">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-200/90" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-neutral-200/70" />
      </div>
      </>
    );
  }

  if (phase === "failed") {
    return (
      <>
        {reviewTopSlot ? <div className="mx-4 mt-4">{reviewTopSlot}</div> : null}
        <div className="mx-4 mt-4 rounded-[14px] border border-dashed border-neutral-200 bg-white px-4 py-3 text-center">
        <p className="text-[12px] text-neutral-500">{t("store_review_summary_load_failed")}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-[13px] font-semibold text-[color:var(--delivery-primary)]"
        >
          {t("common_retry")}
        </button>
        {showFullLink ? (
          <div className="mt-2">
            <Link href={reviewsHref} className="text-[12px] text-neutral-500 underline underline-offset-2">
              {t("store_reviews_view_all_aria")}
            </Link>
          </div>
        ) : null}
      </div>
      </>
    );
  }

  if (!payload || payload.count <= 0) {
    return showFullLink ? (
      <>
        {reviewTopSlot ? <div className="mx-4 mt-4">{reviewTopSlot}</div> : null}
        <div className="mx-4 mt-4 rounded-[14px] border border-neutral-100 bg-white px-4 py-3 text-center">
        <Link
          href={reviewsHref}
          className="text-[13px] font-semibold text-[color:var(--delivery-primary)] underline underline-offset-2"
        >
          {t("store_reviews_title")}
        </Link>
      </div>
      </>
    ) : reviewTopSlot ? (
      <div className="mx-4 mt-4">{reviewTopSlot}</div>
    ) : null;
  }

  return (
    <>
      {reviewTopSlot ? <div className="mx-4 mt-4">{reviewTopSlot}</div> : null}
      <div className="mx-4 mt-4 rounded-[14px] border border-neutral-100 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[15px] font-bold text-neutral-900">{t("store_reviews_title")}</div>
        <Link href={reviewsHref} className="shrink-0 text-[12px] font-semibold text-[color:var(--delivery-primary)]">
          {t("store_show_more")}
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-neutral-700">
        {payload.avg != null && Number.isFinite(payload.avg) ? (
          <span className="font-bold text-amber-600">{payload.avg.toFixed(1)}</span>
        ) : null}
        <span className="text-neutral-500">{t("store_reviews_count", { count: payload.count })}</span>
      </div>
      {payload.recent.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          {payload.recent.slice(0, 3).map((r, i) => {
            const rid = String(r.id ?? i);
            const rt = Number(r.rating);
            const label =
              typeof r.buyer_public_label === "string" ? r.buyer_public_label.trim() : "";
            const body = typeof r.content === "string" ? r.content.trim() : "";
            return (
              <li key={rid} className="text-[13px] leading-snug text-neutral-800">
                <span className="mr-1.5 text-amber-600" aria-hidden>
                  {Number.isFinite(rt) ? starsLabel(rt) : ""}
                </span>
                {label ? <span className="font-semibold text-neutral-600">{label} · </span> : null}
                {body || t("store_content_empty")}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="mt-3 border-t border-neutral-100 pt-3 text-center">
        <Link href={`${storeRootPath}/info`} className="text-[12px] text-neutral-500 underline underline-offset-2">
          {t("store_info_title")}
        </Link>
      </div>
    </div>
    </>
  );
}
