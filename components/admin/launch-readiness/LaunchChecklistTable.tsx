"use client";

import { useMemo, useState } from "react";
import { getLaunchReadinessItems } from "@/lib/launch-readiness/mock-launch-readiness-items";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPhaseLabel,
  getGateLabel,
  getStatusLabel,
  getAreaLabel,
  getPriorityLabel,
} from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";

export function LaunchChecklistTable() {
  const [phase, setPhase] = useState<LaunchReadinessPhase>("pre_launch");
  const items = useMemo(
    () => getLaunchReadinessItems({ phase }),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">단계</span>
        {(["pre_launch", "launch_day", "post_launch"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded border px-3 py-1.5 text-[13px] ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 단계 점검 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "영역",
            "제목",
            "게이트",
            "상태",
            "우선순위",
            "담당",
            "기한",
            "차단 사유",
            "비고",
          ]}
        >
          {items.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-sam-border-soft ${
                i.status === "blocked"
                  ? "bg-red-50/30"
                  : i.status !== "ready"
                    ? "bg-amber-50/20"
                    : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {getAreaLabel(i.area)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {i.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.gateType === "must_have"
                      ? "bg-red-100 text-red-800"
                      : i.gateType === "should_have"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getGateLabel(i.gateType)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.status === "ready"
                      ? "bg-emerald-100 text-emerald-800"
                      : i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : i.status === "in_progress"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {getPriorityLabel(i.priority)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {i.dueDate ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 text-[13px] text-red-700">
                {i.blockerReason ?? "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-sam-muted">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
