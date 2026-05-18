"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_PRIORITY_KEYS,
  OPS_TOOLS_ROADMAP_AREA_KEYS,
  OPS_TOOLS_ROADMAP_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import Link from "next/link";
import type { OpsImprovementRoadmapItem } from "@/lib/types/ops-maturity";

interface OpsRoadmapCardProps {
  item: OpsImprovementRoadmapItem;
}

export function OpsRoadmapCard({ item }: OpsRoadmapCardProps) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        item.status === "blocked"
          ? "border-red-200 bg-red-50/50"
          : item.status === "completed"
            ? "border-emerald-200 bg-emerald-50/30"
            : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
        <span>{t(opsToolsLabel(OPS_TOOLS_ROADMAP_AREA_KEYS, item.domain))}</span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">{t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, item.priority))}</span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">{t(opsToolsLabel(OPS_TOOLS_ROADMAP_STATUS_KEYS, item.status))}</span>
      </div>
      <h3 className="mt-2 font-medium text-sam-fg">{item.title}</h3>
      <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">{item.description}</p>
      {item.milestone && (
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_ops_tools_maturity_roadmap_milestone", { text: item.milestone })}
        </p>
      )}
      {item.sourceId && (
        <p className="mt-1 sam-text-helper text-sam-muted">
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
        <p className="mt-2 sam-text-helper text-sam-muted">
          {item.ownerAdminNickname && `담당 ${item.ownerAdminNickname}`}
          {item.dueDate && ` · 기한 ${item.dueDate}`}
        </p>
      )}
    </div>
  );
}
