"use client";

import { useMemo } from "react";
import { getDrScenarioById } from "@/lib/dr/mock-dr-scenarios";
import { getDrScenarioSteps } from "@/lib/dr/mock-dr-scenario-steps";
import { getDrExecutions } from "@/lib/dr/mock-dr-executions";
import { getScenarioTypeLabel, getDrSeverityLabel, getExecutionStatusLabel } from "@/lib/dr/dr-utils";

interface DrScenarioDetailPageProps {
  scenarioId: string;
}

export function DrScenarioDetailPage({ scenarioId }: DrScenarioDetailPageProps) {
  const scenario = useMemo(
    () => getDrScenarioById(scenarioId),
    [scenarioId]
  );
  const steps = useMemo(
    () => getDrScenarioSteps(scenarioId),
    [scenarioId]
  );
  const executions = useMemo(
    () => getDrExecutions({ scenarioId }),
    [scenarioId]
  );

  if (!scenario) {
    return (
      <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
        시나리오를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
          <span>{getScenarioTypeLabel(scenario.scenarioType)}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              scenario.severity === "critical"
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {getDrSeverityLabel(scenario.severity)}
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold text-gray-900">
          {scenario.title}
        </h2>
        <p className="mt-2 text-[14px] text-gray-700">{scenario.description}</p>
      </div>

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <h3 className="text-[15px] font-medium text-gray-900">대응 단계 체크리스트</h3>
        {steps.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">단계 없음</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px] text-gray-700">
            {steps.map((step) => (
              <li key={step.id}>
                <span className="font-medium">{step.stepTitle}</span>
                <span className="ml-2 text-gray-600">{step.stepDescription}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <h3 className="text-[15px] font-medium text-gray-900">실행 로그 타임라인</h3>
        {executions.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">실행 이력 없음</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {executions.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2 text-[13px] last:border-0 last:pb-0"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    e.executionStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : e.executionStatus === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getExecutionStatusLabel(e.executionStatus)}
                </span>
                시작 {new Date(e.startedAt).toLocaleString()}
                {e.completedAt &&
                  ` · 완료 ${new Date(e.completedAt).toLocaleString()}`}
                {e.executedByAdminId && ` · 실행자 ${e.executedByAdminId}`}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-gray-500">
          리허설 실행 버튼은 mock. 실제 실행 시 워크플로우 기록됩니다.
        </p>
      </div>
    </div>
  );
}
