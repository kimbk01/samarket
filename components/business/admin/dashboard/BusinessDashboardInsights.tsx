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
      <h2 className="text-[15px] font-semibold text-gray-900">정산 · 운영 요약</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">오늘 매출(완료)</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{fmt(todaySalesPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">최근 7일 매출(완료)</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{fmt(weekSalesPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">취소 / 취소율(7일)</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {cancelCount}건 · {cancelRatePercent}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">정산 예정(누적)</p>
          <p className="mt-1 text-lg font-bold text-amber-900">{fmt(settlementScheduledPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">지급 완료(누적)</p>
          <p className="mt-1 text-lg font-bold text-emerald-900">{fmt(settlementPaidPhp)}</p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-medium text-gray-500">보류(누적)</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{fmt(settlementHeldPhp)}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        매출은 최근 주문 목록(최대 100건) 기준 추정치입니다. 정산은 실제 정산 API 반영값입니다.
      </p>
    </section>
  );
}
