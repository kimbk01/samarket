"use client";

import { useMemo, useState } from "react";
import type { OpsActionStatus } from "@/lib/types/ops-board";
import { getOpsActionItems } from "@/lib/ops-board/mock-ops-action-items";
import { getOverdueActionItems } from "@/lib/ops-board/mock-ops-action-items";
import { OpsActionCard } from "./OpsActionCard";

const STATUS_ORDER: OpsActionStatus[] = [
  "open",
  "planned",
  "in_progress",
  "done",
  "archived",
];

export function OpsActionBoard() {
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OpsActionStatus | "">("");

  const allItems = useMemo(
    () => getOpsActionItems({ limit: 100 }),
    [refresh]
  );
  const overdueItems = useMemo(() => getOverdueActionItems(), [refresh]);

  const items = useMemo(() => {
    if (statusFilter) return allItems.filter((a) => a.status === statusFilter);
    return allItems;
  }, [allItems, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value === "" ? "" : (e.target.value as OpsActionStatus))
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 상태</option>
          <option value="open">미해결</option>
          <option value="planned">예정</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="archived">보관</option>
        </select>
        {overdueItems.length > 0 && (
          <span className="rounded bg-red-100 px-2 py-1 text-[13px] font-medium text-red-800">
            기한 초과 {overdueItems.length}건
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          액션아이템이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <OpsActionCard
              key={item.id}
              item={item}
              onUpdate={() => setRefresh((r) => r + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
