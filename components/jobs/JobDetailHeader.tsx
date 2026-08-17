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

function jobStatusLabel(
  t: ReturnType<typeof useI18n>["t"],
  post: PostWithMeta,
  direction: JobDetailDirection
): { label: string; className: string } {
  const st = String(post.status ?? "").toLowerCase();
  const closedClass = "border border-sam-border bg-sam-surface-muted text-sam-muted";
  if (st === "sold") {
    return direction === "seeking"
      ? { label: t("ui_jobs_status_done"), className: closedClass }
      : { label: t("ui_jobs_status_closed"), className: closedClass };
  }
  if (st === "hidden" || st === "blinded" || st === "deleted") {
    return direction === "seeking"
      ? { label: t("ui_jobs_status_done"), className: closedClass }
      : { label: t("ui_jobs_status_closed"), className: closedClass };
  }
  return direction === "seeking"
    ? { label: t("ui_jobs_status_seeking_active"), className: "border-0 bg-sam-primary text-sam-on-primary" }
    : { label: t("ui_jobs_status_hiring_active"), className: "border-0 bg-sam-primary text-sam-on-primary" };
}

function jobPayHeroLine(
  t: ReturnType<typeof useI18n>["t"],
  meta: Record<string, unknown>,
  price: number | null | undefined,
  currency: string,
  direction: JobDetailDirection
): string | null {
  const payType = String(meta.pay_type ?? "").trim();
  const payAmount = meta.pay_amount != null ? Number(meta.pay_amount) : price ?? null;
  const sameDayPay = meta.same_day_pay === true;
  const hirePayNegotiable = meta.hire_pay_negotiable === true || payType === "negotiate";

  const prefix =
    direction === "seeking" ? t("ui_jobs_pay_prefix_seeking") : t("ui_jobs_pay_prefix_hiring");

  if (payAmount != null && !Number.isNaN(payAmount)) {
    const base = `${jobPayTypeLabel(t, payType)} ${formatPrice(payAmount, currency)}`;
    const tail = sameDayPay ? t("ui_jobs_pay_same_day_tail") : "";
    return `${prefix} ${base}${tail}`;
  }
  if (direction === "seeking" && payType === "negotiate") {
    return `${prefix} ${t("jobs_pay_negotiate")}`;
  }
  if (direction === "hiring" && hirePayNegotiable) {
    return `${prefix} ${t("jobs_pay_negotiate")}`;
  }
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
  const status = jobStatusLabel(t, post, direction);

  return (
    <section className="px-0 pt-0">
      {payLine ? <p className={TRADE_FB_DETAIL_PRICE}>{payLine}</p> : null}
      <h2 className={`${TRADE_FB_DETAIL_HERO_TITLE} ${payLine ? "" : "mt-0 "} ${isSoldOpacity ? "opacity-80" : ""}`}>
        {post.title ?? ""}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-6 items-center rounded-[4px] bg-sam-surface-muted px-2 text-[12px] font-semibold leading-none text-sam-fg">
          {typeLabel}
        </span>
        <span
          className={`inline-flex h-6 items-center rounded-[4px] px-2 text-[12px] font-semibold leading-none ${status.className}`}
        >
          {status.label}
        </span>
      </div>
    </section>
  );
}
