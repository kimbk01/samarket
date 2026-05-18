"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { formatPrice } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { jobListingKindLabel, jobPayTypeLabel } from "@/lib/jobs/job-label-keys";
import type { JobDetailDirection } from "@/lib/jobs/resolve-job-detail-direction";
import {
  TRADE_FB_DETAIL_HERO_TITLE,
  TRADE_FB_DETAIL_PRICE,
} from "@/lib/ui/trade-write-fb-ui";

function jobListingTypeLabel(
  t: ReturnType<typeof useI18n>["t"],
  meta: Record<string, unknown>
): string {
  const lk = String(meta.listing_kind ?? "").trim();
  const jt = String(meta.job_type ?? "").trim();
  if (lk) return jobListingKindLabel(t, lk);
  if (jt === "seek") return jobListingKindLabel(t, "work");
  return jobListingKindLabel(t, "hire");
}

function jobStatusLabel(post: PostWithMeta, direction: JobDetailDirection): { label: string; className: string } {
  const st = String(post.status ?? "").toLowerCase();
  if (st === "sold") {
    return direction === "seeking"
      ? { label: "완료", className: "border border-[#e4e6eb] bg-[#f1f3f5] text-[#555555]" }
      : { label: "마감", className: "border border-[#e4e6eb] bg-[#f1f3f5] text-[#555555]" };
  }
  if (st === "hidden" || st === "blinded" || st === "deleted") {
    return direction === "seeking"
      ? { label: "완료", className: "border border-[#e4e6eb] bg-[#f1f3f5] text-[#555555]" }
      : { label: "마감", className: "border border-[#e4e6eb] bg-[#f1f3f5] text-[#555555]" };
  }
  return direction === "seeking"
    ? { label: "구직중", className: "border-0 bg-emerald-600 text-white" }
    : { label: "모집중", className: "border-0 bg-signature text-white" };
}

function jobPayHeroLine(
  meta: Record<string, unknown>,
  price: number | null | undefined,
  currency: string,
  direction: JobDetailDirection
): string | null {
  const payType = String(meta.pay_type ?? "").trim();
  const payAmount = meta.pay_amount != null ? Number(meta.pay_amount) : price ?? null;
  const sameDayPay = meta.same_day_pay === true;
  const hirePayNegotiable = meta.hire_pay_negotiable === true || payType === "negotiate";

  const prefix = direction === "seeking" ? "희망급여" : "급여";

  if (payAmount != null && !Number.isNaN(payAmount)) {
    const base = `${jobPayTypeLabel(t, payType)} ${formatPrice(payAmount, currency)}`;
    const tail = sameDayPay ? " · 당일 지급" : "";
    return `${prefix} ${base}${tail}`;
  }
  if (direction === "seeking" && payType === "negotiate") return `${prefix} 협의`;
  if (direction === "hiring" && hirePayNegotiable) return `${prefix} 협의`;
  return null;
}

export function JobDetailHeader({
  post,
  meta,
  currency,
  direction,
  isSoldOpacity,
}: {
  post: PostWithMeta;
  meta: Record<string, unknown>;
  currency: string;
  direction: JobDetailDirection;
  /** 거래완료 등 흐림 처리 — 기존 상세와 동일 */
  isSoldOpacity: boolean;
}) {
  const { t } = useI18n();
  const typeLabel = jobListingTypeLabel(t, meta);
  const payLine = jobPayHeroLine(t, meta, post.price ?? null, currency, direction);
  const status = jobStatusLabel(post, direction);

  return (
    <section className="px-0 pt-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-6 items-center rounded-[4px] bg-amber-100 px-2 text-[12px] font-semibold leading-none text-amber-950">
          {typeLabel}
        </span>
        <span
          className={`inline-flex h-6 items-center rounded-[4px] px-2 text-[12px] font-semibold leading-none ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <h2 className={`${TRADE_FB_DETAIL_HERO_TITLE} mt-1 ${isSoldOpacity ? "opacity-80" : ""}`}>
        {post.title ?? ""}
      </h2>
      {payLine ? <p className={TRADE_FB_DETAIL_PRICE}>{payLine}</p> : null}
    </section>
  );
}
