"use client";

import { useMemo, useState } from "react";
import { getProductionLaunchChecks } from "@/lib/production-migration/mock-production-launch-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPhaseLabel,
  getAreaLabel,
  getLaunchStatusLabel,
  getPriorityLabel,
} from "@/lib/production-migration/production-migration-utils";
import type {
  ProductionLaunchPhase,
  ProductionLaunchCheckStatus,
} from "@/lib/types/production-migration";
import Link from "next/link";

export function ProductionLaunchCheckTable() {
  const [phase, setPhase] = useState<ProductionLaunchPhase | "">("");
  const checks = useMemo(
    () =>
      getProductionLaunchChecks(
        phase ? { phase: phase as ProductionLaunchPhase } : undefined
      ),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">단계</span>
        {(["before_cutover", "cutover", "after_cutover"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p === phase ? "" : p)}
            className={`rounded border px-3 py-1.5 text-[13px] ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      <p className="text-[12px] text-gray-500">
        SQL 적용·view/rpc/trigger 필요 항목은 비고에 placeholder로 정리됩니다.
      </p>

      {checks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 단계 체크 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "단계",
            "제목",
            "영역",
            "우선순위",
            "상태",
            "담당",
            "차단/비고",
            "연결",
          ]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-gray-100 ${
                c.status === "blocked" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPhaseLabel(c.phase)}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {c.title}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getAreaLabel(c.area)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPriorityLabel(c.priority)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    c.status === "done"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getLaunchStatusLabel(c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 text-[13px] text-gray-500">
                {c.blockerReason || c.note || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {c.linkedType && c.linkedId ? (
                  c.linkedType === "action_item" ? (
                    <Link
                      href="/admin/ops-board"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  ) : (
                    `${c.linkedType}: ${c.linkedId}`
                  )
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
