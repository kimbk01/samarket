"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import { getPatternConnections } from "@/lib/ops-learning/ops-learning-utils";
import { OpsPatternLogList } from "./OpsPatternLogList";
import { OpsImprovementSuggestionTable } from "./OpsImprovementSuggestionTable";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import {
  OPS_TOOLS_PATTERN_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

interface OpsPatternDetailPanelProps {
  patternId: string | null;
  onClose?: () => void;
}

export function OpsPatternDetailPanel({ patternId, onClose }: OpsPatternDetailPanelProps) {
  const { t } = useI18n();
  const connections = useMemo(
    () => (patternId ? getPatternConnections(patternId) : null),
    [patternId]
  );

  if (!patternId || !connections) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_learning_detail_empty")}</div>
    );
  }

  const { pattern, linkedDocument, linkedRunbookDocument, suggestions } = connections;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="sam-text-body font-medium text-sam-fg">{pattern.title}</h3>
          <p className="mt-1 sam-text-helper text-sam-muted">{pattern.patternKey}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sam-meta hover:text-sam-muted">
            ×
          </button>
        )}
      </div>
      <div className="rounded border border-sam-border-soft bg-sam-app p-3 sam-text-body-secondary">
        <p>
          {t("admin_ops_tools_learning_occurred", {
            count: pattern.occurrenceCount,
            surface: pattern.surface,
            type: pattern.incidentType,
          })}
        </p>
        <p className="mt-1 text-sam-muted">
          {t("admin_ops_tools_learning_first_last", {
            first: new Date(pattern.firstOccurredAt).toLocaleDateString(),
            last: new Date(pattern.lastOccurredAt).toLocaleDateString(),
          })}
        </p>
        <p className="mt-1">
          {t("admin_ops_tools_learning_status_label")}
          <span className="font-medium">
            {t(opsToolsLabel(OPS_TOOLS_PATTERN_STATUS_KEYS, pattern.status))}
          </span>
        </p>
      </div>
      <div>
        <p className="sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_learning_th_linked_doc")}</p>
        <div className="mt-1 space-y-1">
          {linkedDocument && (
            <Link href={`/admin/ops-docs/${pattern.linkedDocumentId}`} className="block sam-text-body-secondary text-signature hover:underline">
              문서: {linkedDocument.title}
            </Link>
          )}
          {linkedRunbookDocument && pattern.linkedRunbookDocumentId && (
            <Link href={`/admin/ops-docs/${pattern.linkedRunbookDocumentId}`} className="block sam-text-body-secondary text-signature hover:underline">
              런북 문서: {linkedRunbookDocument.title}
            </Link>
          )}
          {!linkedDocument && !linkedRunbookDocument && (
            <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_learning_no_linked_doc")}</span>
          )}
        </div>
      </div>
      <OpsImprovementSuggestionTable patternId={patternId} compact />
      <OpsPatternLogList patternId={patternId} />
    </div>
  );
}
