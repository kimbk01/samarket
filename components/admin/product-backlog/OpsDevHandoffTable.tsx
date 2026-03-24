"use client";

import { useMemo, useState } from "react";
import { getOpsDevHandoffItems } from "@/lib/product-backlog/mock-ops-dev-handoff-items";
import { getProductBacklogItemById } from "@/lib/product-backlog/mock-product-backlog-items";
import { AdminTable } from "@/components/admin/AdminTable";
import { getHandoffStatusLabel } from "@/lib/product-backlog/product-backlog-utils";
import type { OpsDevHandoffStatus } from "@/lib/types/product-backlog";
import Link from "next/link";

export function OpsDevHandoffTable() {
  const [statusFilter, setStatusFilter] = useState<OpsDevHandoffStatus | "">("");
  const items = useMemo(
    () =>
      getOpsDevHandoffItems(
        statusFilter ? { handoffStatus: statusFilter } : undefined
      ),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">handoff 상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as OpsDevHandoffStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="accepted">수락</option>
          <option value="in_progress">진행중</option>
          <option value="shipped">완료</option>
          <option value="returned">반려</option>
        </select>
      </div>
      <p className="text-[12px] text-gray-500">
        운영→개발 handoff note. acceptanceCriteria·assignedDevName은 placeholder 확장 가능.
      </p>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          handoff 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "백로그 항목",
            "상태",
            "운영 요약",
            "개발 메모",
            "요청자",
            "담당(개발)",
          ]}
        >
          {items.map((h) => {
            const backlog = getProductBacklogItemById(h.backlogItemId);
            return (
              <tr key={h.id} className="border-b border-gray-100">
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {backlog?.title ?? h.backlogItemId}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[12px] ${
                      h.handoffStatus === "shipped"
                        ? "bg-emerald-50 text-emerald-700"
                        : h.handoffStatus === "in_progress" || h.handoffStatus === "accepted"
                          ? "bg-blue-50 text-blue-700"
                          : h.handoffStatus === "returned"
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {getHandoffStatusLabel(h.handoffStatus)}
                  </span>
                </td>
                <td className="max-w-[200px] px-3 py-2.5 text-[13px] text-gray-600 line-clamp-2">
                  {h.opsSummary}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 text-[13px] text-gray-600 line-clamp-2">
                  {h.devNote || "-"}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-500">
                  {h.requestedByAdminNickname ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-500">
                  {h.assignedDevName || "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
