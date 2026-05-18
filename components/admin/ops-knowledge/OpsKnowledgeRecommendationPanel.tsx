"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeRecommendSourceType } from "@/lib/types/ops-knowledge";
import { getRecommendationsForSource } from "@/lib/ops-knowledge/ops-knowledge-utils";
import { logRecommendationClick } from "@/lib/ops-knowledge/ops-knowledge-utils";
import { addRecentView } from "@/lib/ops-knowledge/ops-knowledge-utils";
import type { OpsKnowledgeRecentViewSourceType } from "@/lib/types/ops-knowledge";

interface OpsKnowledgeRecommendationPanelProps {
  sourceType: OpsKnowledgeRecommendSourceType;
  sourceId?: string | null;
  title?: string;
  titleKey?: import("@/lib/i18n/messages").MessageKey;
  compact?: boolean;
  recentViewSource?: OpsKnowledgeRecentViewSourceType;
}

export function OpsKnowledgeRecommendationPanel({
  sourceType,
  sourceId = null,
  title,
  titleKey,
  compact = false,
  recentViewSource = "incident",
}: OpsKnowledgeRecommendationPanelProps) {
  const { t } = useI18n();
  const panelTitle =
    titleKey != null
      ? t(titleKey)
      : title ?? t("admin_ops_tools_kb_related_docs", { source: t(opsToolsLabel(OPS_TOOLS_KB_SOURCE_KEYS, sourceType)) });
  const rec = useMemo(
    () => getRecommendationsForSource(sourceType, sourceId, 5),
    [sourceType, sourceId]
  );

  const handleClick = (documentId: string) => {
    logRecommendationClick(sourceType, sourceId, documentId);
    addRecentView(documentId, recentViewSource);
  };

  if (rec.items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <h3 className="sam-text-body-secondary font-medium text-sam-fg">{panelTitle}</h3>
        <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_ops_tools_kb_no_recommend")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <h3 className="sam-text-body-secondary font-medium text-sam-fg">{panelTitle}</h3>
      <ul className={`mt-2 space-y-1 ${compact ? "" : "space-y-2"}`}>
        {rec.items.map((item) => (
          <li key={item.documentId}>
            <Link
              href={`/admin/ops-docs/${item.documentId}`}
              className="block sam-text-body-secondary text-signature hover:underline"
              onClick={() => handleClick(item.documentId)}
            >
              {item.title}
            </Link>
            {!compact && (
              <p className="mt-0.5 sam-text-xxs text-sam-muted">
                {item.reasonLabel} · {(item.score * 100).toFixed(0)}%
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
