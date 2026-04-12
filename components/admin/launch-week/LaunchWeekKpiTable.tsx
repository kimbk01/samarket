"use client";

import { useMemo, useState } from "react";
import { getLaunchWeekKpis } from "@/lib/launch-week/mock-launch-week-kpis";
import { AdminTable } from "@/components/admin/AdminTable";

export function LaunchWeekKpiTable() {
  const [observedDate, setObservedDate] = useState<string>("");
  const kpis = useMemo(
    () =>
      getLaunchWeekKpis(
        observedDate ? { observedDate } : undefined
      ),
    [observedDate]
  );

  const dates = useMemo(() => {
    const list = getLaunchWeekKpis();
    return [...new Set(list.map((k) => k.observedDate))].sort().reverse();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">일자</span>
        <select
          value={observedDate}
          onChange={(e) => setObservedDate(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체 (Day 1~7)</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-sam-muted">
        시간대별 운영 타임라인은 placeholder로 확장 가능합니다.
      </p>

      {kpis.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 일자 KPI가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "일자",
            "가입",
            "상품등록",
            "채팅시작",
            "거래완료",
            "신고",
            "장애",
            "Fallback",
            "Kill Switch",
            "포인트충전",
            "광고신청",
          ]}
        >
          {kpis.map((k) => (
            <tr key={k.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {k.observedDate}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.signUpCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.productCreatedCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.chatStartedCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {k.transactionCompletedCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.reportCreatedCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.incidentCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.fallbackCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.killSwitchCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.pointChargeRequestCount}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {k.adApplicationCount}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
