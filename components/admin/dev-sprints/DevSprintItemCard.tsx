"use client";

import type { DevSprintItem } from "@/lib/types/dev-sprints";
import {
  getSprintItemStatusLabel,
  getSprintItemPriorityLabel,
  getSprintItemOwnerTypeLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";
import Link from "next/link";

interface DevSprintItemCardProps {
  item: DevSprintItem;
}

export function DevSprintItemCard({ item }: DevSprintItemCardProps) {
  const isBlocked = item.status === "blocked";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isBlocked ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5">
          {getSprintItemPriorityLabel(item.priority)}
        </span>
        <span>{getSprintItemOwnerTypeLabel(item.ownerType)}</span>
        {item.estimatePoint != null && (
          <span>{item.estimatePoint}pt</span>
        )}
      </div>
      <p className="mt-2 font-medium text-gray-900">{item.title}</p>
      {item.description && (
        <p className="mt-1 line-clamp-2 text-[13px] text-gray-600">
          {item.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span
          className={`rounded px-1.5 py-0.5 ${
            isBlocked
              ? "bg-red-100 text-red-800"
              : item.status === "done"
                ? "bg-emerald-50 text-emerald-700"
                : item.status === "in_progress" || item.status === "review"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-600"
          }`}
        >
          {getSprintItemStatusLabel(item.status)}
        </span>
        {item.ownerName && <span className="text-gray-500">{item.ownerName}</span>}
      </div>
      {item.blockerReason && (
        <p className="mt-2 text-[12px] font-medium text-red-700">
          블로커: {item.blockerReason}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
        {item.linkedQaIssueId && (
          <Link href="/admin/qa-board" className="text-signature hover:underline">
            QA
          </Link>
        )}
        {item.linkedActionItemId && (
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            액션
          </Link>
        )}
        {item.linkedDeploymentId && (
          <Link href="/admin/recommendation-deployments" className="text-signature hover:underline">
            배포
          </Link>
        )}
      </div>
    </div>
  );
}
