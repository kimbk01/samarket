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
        <span className="sam-text-body-secondary text-sam-muted">단계</span>
        {(["before_cutover", "cutover", "after_cutover"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p === phase ? "" : p)}
            className={`rounded border px-3 py-1.5 sam-text-body-secondary ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      <p className="sam-text-helper text-sam-muted">
        SQL 적용·view/rpc/trigger 필요 항목은 비고에 placeholder로 정리됩니다.
      </p>

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
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
              className={`border-b border-sam-border-soft ${
                c.status === "blocked" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPhaseLabel(c.phase)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getAreaLabel(c.area)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(c.priority)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
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
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.blockerReason || c.note || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
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
