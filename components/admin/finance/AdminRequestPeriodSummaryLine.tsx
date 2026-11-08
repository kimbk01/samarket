"use client";

import type {
  AdminRequestBucketTotal,
  AdminRequestPeriodSummary,
} from "@/lib/admin/finance/admin-request-period-summary";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/**
 * 관리자 신청 목록 기간 합계 줄 (H-10 · Owner 2026-11-03 「이번 달 출금 얼마?」).
 * 서버가 고른 기간 **전체**로 계산한 값만 보여 준다 (현재 쪽 합계가 아님 · 상태 필터와 무관).
 */
export function AdminRequestPeriodSummaryLine({
  ko,
  summary,
  formatAmount,
  formatAmount2,
  approvedLabel,
  note,
}: {
  ko: boolean;
  summary: AdminRequestPeriodSummary | null | undefined;
  formatAmount: (amount: number) => string;
  /** 보조 금액(예: Point 충전의 결제 ₱) — 없으면 표시 안 함. */
  formatAmount2?: (amount: number) => string;
  /** 승인 칸 이름 (Coin 출금 = 「지급 완료」). */
  approvedLabel?: { ko: string; en: string };
  /** 추가 안내 (예: 검색에는 기간이 적용되지 않음). */
  note?: string | null;
}) {
  if (!summary) return null;
  const range =
    summary.fromDay || summary.toDay
      ? `${summary.fromDay ?? "…"} ~ ${summary.toDay ?? "…"}`
      : ko
        ? "전체 기간"
        : "All time";
  const cell = (label: string, b: AdminRequestBucketTotal, key: string) => (
    <div key={key} className="min-w-[8.5rem]" data-admin-request-summary-cell={key}>
      <dt className="sam-text-xxs text-sam-muted">{label}</dt>
      <dd className="tabular-nums font-semibold text-sam-fg">
        {formatAmount(b.amount)}
        <span className="ml-1 sam-text-xxs font-normal text-sam-muted">
          {ko ? `${formatAdminNumber(b.count)}건` : `${formatAdminNumber(b.count)}`}
        </span>
        {formatAmount2 ? (
          <span className="block sam-text-xxs font-normal text-sam-muted">{formatAmount2(b.amount2)}</span>
        ) : null}
      </dd>
    </div>
  );
  const approved = approvedLabel ?? catalogPair("admin_approved");
  /** R3-i — 칸마다 기간 기준을 적는다. 처리 칸(승인·지급 완료·반려)은 처리 시각 기준. */
  const processed = summary.decidedBasis === "processed";
  const reqTag = ko ? " (신청 기준)" : " (by request)";
  const decTag = processed ? (ko ? " (처리 기준)" : " (by processed)") : reqTag;
  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-admin-request-period-summary="1"
    >
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? `기간 합계 · ${range} (PHT) · ${
              processed
                ? "신청·대기·취소 = 신청 시각 기준, 승인·반려 = 처리 시각 기준"
                : "모든 칸 = 신청 시각 기준"
            } · 상태 조건·페이지와 무관`
          : `Period totals · ${range} (PHT) · ${
              processed
                ? "requested/pending/cancelled by request time, approved/rejected by processed time"
                : "all by request time"
            } · independent of status filter and page`}
      </p>
      <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
        {cell(`${ko ? "신청" : "Requested"}${reqTag}`, summary.requested, "requested")}
        {cell(`${ko ? approved.ko : approved.en}${decTag}`, summary.approved, "approved")}
        {cell(`${ko ? "반려" : "Rejected"}${decTag}`, summary.rejected, "rejected")}
        {cell(`${ko ? "대기" : "Pending"}${reqTag}`, summary.pending, "pending")}
        {summary.other.count > 0 ? cell(`${ko ? "취소" : "Cancelled"}${reqTag}`, summary.other, "other") : null}
      </dl>
      {summary.truncated ? (
        <p role="alert" className="mt-1 sam-text-xxs text-sam-danger">
          {ko
            ? "기간 내 신청이 너무 많아 일부(최대 50,000건)만 합산했습니다. 기간을 좁혀 주세요."
            : "Too many requests in this period — only the first 50,000 were summed. Narrow the period."}
        </p>
      ) : null}
      {note ? <p className="mt-1 sam-text-xxs text-sam-muted">{note}</p> : null}
    </section>
  );
}
