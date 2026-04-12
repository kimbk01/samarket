"use client";

import { useMemo } from "react";
import { getAutomationRules } from "@/lib/automation/mock-automation-rules";
import { AdminTable } from "@/components/admin/AdminTable";
import { getTriggerTypeLabel, getActionTypeLabel } from "@/lib/automation/automation-utils";

export function AutomationRulesTable() {
  const rules = useMemo(() => getAutomationRules(), []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-sam-muted">
        장애 알림·성능 임계치·DR 트리거. Slack/Email 알림은 placeholder.
      </p>
      {rules.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          자동화 룰이 없습니다.
        </div>
      ) : (
        <AdminTable headers={["룰명", "트리거", "임계치", "액션", "ON/OFF"]}>
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.ruleName}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {getTriggerTypeLabel(r.triggerType)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {r.threshold}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {getActionTypeLabel(r.actionType)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {r.isActive ? "ON" : "OFF"}
                </span>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
