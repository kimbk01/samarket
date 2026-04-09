"use client";

import Link from "next/link";
import type { OpsImprovementRoadmapItem } from "@/lib/types/ops-maturity";

const STATUS_LABELS: Record<string, string> = {
  planned: "예정",
  approved: "승인",
  in_progress: "진행중",
  blocked: "차단",
  completed: "완료",
  deferred: "보류",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const DOMAIN_LABELS: Record<string, string> = {
  monitoring: "모니터링",
  automation: "자동화",
  documentation: "문서화",
  response: "대응",
  recommendation_quality: "추천품질",
  learning: "학습",
};

interface OpsRoadmapCardProps {
  item: OpsImprovementRoadmapItem;
}

export function OpsRoadmapCard({ item }: OpsRoadmapCardProps) {
  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        item.status === "blocked"
          ? "border-red-200 bg-red-50/50"
          : item.status === "completed"
            ? "border-emerald-200 bg-emerald-50/30"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
        <span>{DOMAIN_LABELS[item.domain]}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">{PRIORITY_LABELS[item.priority]}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">{STATUS_LABELS[item.status]}</span>
      </div>
      <h3 className="mt-2 font-medium text-gray-900">{item.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] text-gray-600">{item.description}</p>
      {item.milestone && (
        <p className="mt-2 text-[12px] text-gray-500">마일스톤: {item.milestone}</p>
      )}
      {item.sourceId && (
        <p className="mt-1 text-[12px] text-gray-500">
          출처: {item.sourceType} ·{" "}
          {item.sourceType === "learning_pattern" && (
            <Link href="/admin/ops-learning" className="text-signature hover:underline">
              {item.sourceId}
            </Link>
          )}
          {item.sourceType === "action_item" && (
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              {item.sourceId}
            </Link>
          )}
          {!["learning_pattern", "action_item"].includes(item.sourceType) && item.sourceId}
        </p>
      )}
      {(item.ownerAdminNickname || item.dueDate) && (
        <p className="mt-2 text-[12px] text-gray-500">
          {item.ownerAdminNickname && `담당 ${item.ownerAdminNickname}`}
          {item.dueDate && ` · 기한 ${item.dueDate}`}
        </p>
      )}
    </div>
  );
}
