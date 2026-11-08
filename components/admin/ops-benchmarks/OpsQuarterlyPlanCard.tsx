"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { OpsQuarterlyPlan } from "@/lib/types/ops-benchmarks";

const STATUS_LABELS: Record<string, MessageKey> = {
  planned: "admin_ops_bench_plan_status_planned",
  approved: "admin_ops_bench_plan_status_approved",
  in_progress: "admin_ops_bench_plan_status_in_progress",
  at_risk: "admin_ops_bench_plan_status_at_risk",
  completed: "admin_ops_bench_plan_status_completed",
  dropped: "admin_ops_bench_plan_status_dropped",
};

const PRIORITY_LABELS: Record<string, MessageKey> = {
  low: "admin_ops_bench_plan_priority_low",
  medium: "admin_ops_bench_plan_priority_medium",
  high: "admin_ops_bench_plan_priority_high",
  critical: "admin_ops_bench_plan_priority_critical",
};

const DOMAIN_LABELS: Record<string, MessageKey> = {
  recommendation_quality: "admin_ops_bench_plan_domain_recommendation_quality",
  incident_response: "admin_ops_bench_plan_domain_incident_response",
  automation: "admin_ops_bench_plan_domain_automation",
  documentation: "admin_ops_bench_plan_domain_documentation",
  execution: "admin_ops_bench_plan_domain_execution",
  learning: "admin_ops_bench_plan_domain_learning",
};

interface OpsQuarterlyPlanCardProps {
  plan: OpsQuarterlyPlan;
}

export function OpsQuarterlyPlanCard({ plan }: OpsQuarterlyPlanCardProps) {
  const { t } = useI18n();
  const isAtRisk = plan.status === "at_risk";
  const isCompleted = plan.status === "completed";
  const isDropped = plan.status === "dropped";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isAtRisk
          ? "border-sam-warning bg-sam-warning-soft"
          : isCompleted
            ? "border-sam-success bg-sam-success-soft"
            : isDropped
              ? "border-sam-border bg-sam-app"
              : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
        <span>{t(DOMAIN_LABELS[plan.domain])}</span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {t(PRIORITY_LABELS[plan.priority])}
        </span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {t(STATUS_LABELS[plan.status])}
        </span>
        <span>
          {plan.year} {plan.quarter}
        </span>
      </div>
      <h3 className="mt-2 font-medium text-sam-fg">{plan.title}</h3>
      <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">
        {plan.description}
      </p>
      {(plan.targetMetric || plan.targetValue) && (
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_ops_bench_plan_target", { metric: plan.targetMetric, value: plan.targetValue })}
        </p>
      )}
      {plan.milestone && (
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_ops_bench_plan_milestone", { milestone: plan.milestone })}
        </p>
      )}
      {plan.relatedRoadmapItemId && (
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_ops_bench_plan_roadmap")}{" "}
          <Link
            href="/admin/ops-maturity"
            className="text-signature hover:underline"
          >
            {plan.relatedRoadmapItemId}
          </Link>
        </p>
      )}
      {(plan.ownerAdminNickname || plan.dueDate) && (
        <p className="mt-2 sam-text-helper text-sam-muted">
          {plan.ownerAdminNickname && t("admin_ops_bench_plan_owner", { name: plan.ownerAdminNickname })}
          {plan.dueDate && t("admin_ops_bench_plan_due_suffix", { date: plan.dueDate })}
        </p>
      )}
    </div>
  );
}
