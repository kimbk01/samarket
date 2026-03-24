"use client";

import { useMemo } from "react";
import { getAutomationLogs } from "@/lib/automation/mock-automation-logs";
import { getAutomationRuleById } from "@/lib/automation/mock-automation-rules";

export function AutomationLogList() {
  const logs = useMemo(() => getAutomationLogs(), []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-gray-500">자동화 룰 실행 로그</p>
      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          실행 로그가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => {
            const rule = getAutomationRuleById(l.ruleId);
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-700"
              >
                <span className="font-medium">{rule?.ruleName ?? l.ruleId}</span>
                <span className="text-gray-500">
                  {new Date(l.triggeredAt).toLocaleString()}
                </span>
                <span className="text-gray-600">→ {l.actionResult}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
