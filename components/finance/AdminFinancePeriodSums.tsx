"use client";

import type { AdminFinanceSumCell } from "@/lib/finance/admin-finance-period-sums";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

/**
 * 관리자 재무 화면 기간 계산 합계 줄 (재감사 C-1). 서버가 목록과 같은 조건 **전체**로 계산한 값만 보여 준다
 * (현재 쪽 합계가 아님 · 쪽 이동과 무관). 모양 = `AdminRequestPeriodSummaryLine` 과 같다.
 */
export function AdminFinancePeriodSums({
  ko,
  title,
  range,
  cells,
  basis,
  emptyText,
  line,
}: {
  ko: boolean;
  /** 예: 「기간 합계」 「조건 합계」 */
  title?: string;
  /** 기간 글자 (PHT 날짜) — null 이면 기간 없음(조건 합계) */
  range: string | null;
  cells: readonly AdminFinanceSumCell[] | null;
  /** 기간 기준 설명 (예: 「원장 기록 시각 기준」) */
  basis?: string | null;
  emptyText?: string;
  /** 칸 대신 한 줄 (예: 포인트 칸별 합계 「충전 +x P · 사용 −y P」) */
  line?: string | null;
}) {
  if (!cells && !line) return null;
  const head = [
    title ?? (ko ? "기간 합계" : "Period totals"),
    range != null ? `${range} (PHT)` : null,
    basis ?? null,
    ko ? "조건 전체 · 페이지와 무관" : "all matching rows · independent of page",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-admin-finance-period-sums="1"
    >
      <p className="sam-text-helper text-sam-muted">{head}</p>
      {line ? (
        <p className="mt-1 sam-text-body-secondary font-semibold tabular-nums text-sam-fg" data-admin-finance-sum-line="1">
          {line}
        </p>
      ) : !cells || cells.length === 0 ? (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{emptyText ?? (ko ? "해당 기간 내역 없음" : "No entries")}</p>
      ) : (
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
          {cells.map((c) => (
            <div key={c.key} className="min-w-[8.5rem]" data-admin-finance-sum-cell={c.key}>
              <dt className="sam-text-xxs text-sam-muted">{c.label}</dt>
              <dd className="tabular-nums font-semibold text-sam-fg">
                {c.amount ?? "—"}
                <span className="ml-1 sam-text-xxs font-normal text-sam-muted">
                  {ko ? `${formatAdminNumber(c.count)}건` : formatAdminNumber(c.count)}
                </span>
                {c.note ? <span className="block sam-text-xxs font-normal text-sam-muted">{c.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
