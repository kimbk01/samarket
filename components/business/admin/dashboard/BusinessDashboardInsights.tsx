"use client";

export function BusinessDashboardInsights({
  todaySalesPhp,
  weekSalesPhp,
  cancelCount,
  cancelRatePercent,
  settlementScheduledPhp,
  settlementPaidPhp,
  settlementHeldPhp,
}: {
  todaySalesPhp: number;
  weekSalesPhp: number;
  cancelCount: number;
  cancelRatePercent: number;
  settlementScheduledPhp: number;
  settlementPaidPhp: number;
  settlementHeldPhp: number;
}) {
  const fmt = (n: number) => `₱${Math.round(n).toLocaleString()}`;

  return (
    <section className="space-y-2">
      <h2 className="sam-text-body font-semibold text-sam-fg">정산 · 운영 요약</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">오늘 매출(완료)</p>
          <p className="mt-1 text-xl font-bold text-sam-fg">{fmt(todaySalesPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">최근 7일 매출(완료)</p>
          <p className="mt-1 text-xl font-bold text-sam-fg">{fmt(weekSalesPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">취소 / 취소율(7일)</p>
          <p className="mt-1 text-xl font-bold text-sam-fg">
            {cancelCount}건 · {cancelRatePercent}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">정산 예정(누적)</p>
          <p className="mt-1 text-lg font-bold text-amber-900">{fmt(settlementScheduledPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">지급 완료(누적)</p>
          <p className="mt-1 text-lg font-bold text-emerald-900">{fmt(settlementPaidPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-helper font-medium text-sam-muted">보류(누적)</p>
          <p className="mt-1 text-lg font-bold text-sam-fg">{fmt(settlementHeldPhp)}</p>
        </div>
      </div>
      <p className="sam-text-xxs text-sam-meta">
        매출은 최근 주문 목록(최대 100건) 기준 추정치입니다. 정산은 실제 정산 API 반영값입니다.
      </p>
    </section>
  );
}
