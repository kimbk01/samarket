"use client";

import { useMemo } from "react";
import { getAutomationLogs } from "@/lib/automation/mock-automation-logs";
import { getAutomationRuleById } from "@/lib/automation/mock-automation-rules";

export function AutomationLogList() {
  const logs = useMemo(() => getAutomationLogs(), []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-sam-muted">자동화 룰 실행 로그</p>
      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          실행 로그가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => {
            const rule = getAutomationRuleById(l.ruleId);
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-[13px] text-sam-fg"
              >
                <span className="font-medium">{rule?.ruleName ?? l.ruleId}</span>
                <span className="text-sam-muted">
                  {new Date(l.triggeredAt).toLocaleString()}
                </span>
                <span className="text-sam-muted">→ {l.actionResult}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
