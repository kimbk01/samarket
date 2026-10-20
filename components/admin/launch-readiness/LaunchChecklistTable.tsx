"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getLaunchReadinessItems } from "@/lib/launch-readiness/launch-readiness-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPhaseLabel,
  getGateLabel,
  getStatusLabel,
  getAreaLabel,
  getPriorityLabel,
} from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

export function LaunchChecklistTable() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<LaunchReadinessPhase>("pre_launch");
  const items = useMemo(
    () => getLaunchReadinessItems({ phase }),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_launch_readiness_k0e685c7c")}</span>
        {(["pre_launch", "launch_day", "post_launch"] as const).map((p) => (
          <AdminChipButton
            key={p}
            selected={phase === p}
            onClick={() => setPhase(p)}
            >
            {getPhaseLabel(p)}
          </AdminChipButton>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
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
                  ? "bg-sam-danger-soft"
                  : i.status !== "ready"
                    ? "bg-sam-warning-soft"
                    : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getAreaLabel(i.area)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {i.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.gateType === "must_have"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : i.gateType === "should_have"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getGateLabel(i.gateType)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.status === "ready"
                      ? "bg-sam-success-soft text-sam-success"
                      : i.status === "blocked"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : i.status === "in_progress"
                          ? "bg-sam-info-soft text-sam-info"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(i.priority)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {i.dueDate ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 sam-text-body-secondary text-sam-danger">
                {i.blockerReason ?? "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
