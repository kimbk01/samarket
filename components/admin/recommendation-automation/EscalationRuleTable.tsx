"use client";

import { useMemo } from "react";
import { getRecommendationEscalationRules } from "@/lib/recommendation-automation/mock-recommendation-escalation-rules";
import type {
  EscalationSeverity,
  EscalationTriggerType,
  EscalationChannel,
} from "@/lib/types/recommendation-automation";

const SEVERITY_LABELS: Record<EscalationSeverity, string> = {
  warning: "경고",
  critical: "위험",
};

const TRIGGER_LABELS: Record<EscalationTriggerType, string> = {
  empty_feed_spike: "빈피드 급증",
  ctr_drop: "CTR 하락",
  conversion_drop: "전환율 하락",
  deployment_failure: "배포 실패",
  fallback_active: "Fallback 활성",
  kill_switch_active: "킬스위치 활성",
};

const CHANNEL_LABELS: Record<EscalationChannel, string> = {
  dashboard_only: "대시보드",
  email: "이메일",
  slack: "Slack",
  sms: "SMS",
  admin_call: "관리자 호출",
};

export function EscalationRuleTable() {
  const rules = useMemo(() => getRecommendationEscalationRules(), []);

  if (rules.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        Escalation 규칙이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              단계
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              심각도
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              트리거
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              채널
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              지연(분)
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.stepOrder}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                    r.severity === "critical"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {SEVERITY_LABELS[r.severity]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {TRIGGER_LABELS[r.triggerType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {CHANNEL_LABELS[r.channel]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.delayMinutes}
              </td>
              <td className="px-3 py-2.5">
                {r.isActive ? (
                  <span className="text-[13px] text-emerald-600">ON</span>
                ) : (
                  <span className="text-[13px] text-sam-meta">OFF</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
