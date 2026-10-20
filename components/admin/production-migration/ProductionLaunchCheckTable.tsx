"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getProductionLaunchChecks } from "@/lib/production-migration/production-migration-state";
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
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["phase"] as const;

export function ProductionLaunchCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 단계 필터는 주소(`?phase=`)에 보존 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const phase = lq.query.extras.phase as ProductionLaunchPhase | "";
  const checks = useMemo(
    () =>
      getProductionLaunchChecks(
        phase ? { phase: phase as ProductionLaunchPhase } : undefined
      ),
    [phase]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect
          ko={ko}
          label={t("admin_launch_readiness_k0e685c7c")}
          name="phase"
          value={lq.query.extras.phase}
          onChange={(v) => lq.setExtra("phase", v)}
          options={(["before_cutover", "cutover", "after_cutover"] as const).map((p) => ({ value: p, label: getPhaseLabel(p) }))}
        />
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">
        SQL 적용·view/rpc/trigger 필요 항목은 비고에 placeholder로 정리됩니다.
      </p>

      {checks.length === 0 ? (
        <AdminEmptyState ko={ko} message={"해당 단계 체크 항목이 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
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
                c.status === "blocked" ? "bg-sam-danger-soft/30" : ""
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
                      ? "bg-sam-success-soft text-sam-success"
                      : c.status === "blocked"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
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
