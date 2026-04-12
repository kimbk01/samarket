"use client";

import Link from "next/link";
import type { OpsQuarterlyPlan } from "@/lib/types/ops-benchmarks";

const STATUS_LABELS: Record<string, string> = {
  planned: "예정",
  approved: "승인",
  in_progress: "진행중",
  at_risk: "위험",
  completed: "완료",
  dropped: "중단",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const DOMAIN_LABELS: Record<string, string> = {
  recommendation_quality: "추천 품질",
  incident_response: "장애 대응",
  automation: "자동화",
  documentation: "문서화",
  execution: "운영 실행력",
  learning: "학습/회고",
};

interface OpsQuarterlyPlanCardProps {
  plan: OpsQuarterlyPlan;
}

export function OpsQuarterlyPlanCard({ plan }: OpsQuarterlyPlanCardProps) {
  const isAtRisk = plan.status === "at_risk";
  const isCompleted = plan.status === "completed";
  const isDropped = plan.status === "dropped";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isAtRisk
          ? "border-amber-200 bg-amber-50/50"
          : isCompleted
            ? "border-emerald-200 bg-emerald-50/30"
            : isDropped
              ? "border-sam-border bg-sam-app"
              : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sam-muted">
        <span>{DOMAIN_LABELS[plan.domain]}</span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {PRIORITY_LABELS[plan.priority]}
        </span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {STATUS_LABELS[plan.status]}
        </span>
        <span>
          {plan.year} {plan.quarter}
        </span>
      </div>
      <h3 className="mt-2 font-medium text-sam-fg">{plan.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] text-sam-muted">
        {plan.description}
      </p>
      {(plan.targetMetric || plan.targetValue) && (
        <p className="mt-2 text-[12px] text-sam-muted">
          목표: {plan.targetMetric} = {plan.targetValue}
        </p>
      )}
      {plan.milestone && (
        <p className="mt-1 text-[12px] text-sam-muted">
          마일스톤: {plan.milestone}
        </p>
      )}
      {plan.relatedRoadmapItemId && (
        <p className="mt-1 text-[12px] text-sam-muted">
          로드맵:{" "}
          <Link
            href="/admin/ops-maturity"
            className="text-signature hover:underline"
          >
            {plan.relatedRoadmapItemId}
          </Link>
        </p>
      )}
      {(plan.ownerAdminNickname || plan.dueDate) && (
        <p className="mt-2 text-[12px] text-sam-muted">
          {plan.ownerAdminNickname && `담당 ${plan.ownerAdminNickname}`}
          {plan.dueDate && ` · 기한 ${plan.dueDate}`}
        </p>
      )}
    </div>
  );
}
