"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_SUGGESTION_STATUS_KEYS,
  OPS_TOOLS_SUGGESTION_TYPE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsImprovementSuggestions } from "@/lib/ops-learning/mock-ops-improvement-suggestions";
import type { OpsSuggestionStatus } from "@/lib/types/ops-learning";

interface OpsImprovementSuggestionTableProps {
  patternId?: string | null;
  compact?: boolean;
}

export function OpsImprovementSuggestionTable({
  patternId = null,
  compact = false,
}: OpsImprovementSuggestionTableProps) {
  const { t } = useI18n();
  const suggestions = useMemo(
    () => getOpsImprovementSuggestions({ patternId: patternId ?? undefined }),
    [patternId]
  );

  if (suggestions.length === 0) {
    return (
      <div className="rounded border border-sam-border-soft bg-sam-surface py-4 text-center sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_learning_suggest_empty")}</div>
    );
  }

  if (compact) {
    return (
      <div>
        <p className="sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_learning_tab_suggestions")}</p>
        <ul className="mt-1 space-y-1 sam-text-body-secondary text-sam-fg">
          {suggestions.slice(0, 3).map((s) => (
            <li key={s.id}>
              {s.title} · {t(opsToolsLabel(OPS_TOOLS_SUGGESTION_STATUS_KEYS, s.status))}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_title")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_node_action")}</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_SUGGESTION_TYPE_KEYS, s.suggestionType))}
              </td>
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{s.title}</span>
                <p className="mt-0.5 sam-text-helper text-sam-muted line-clamp-1">{s.description}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-fg">
                  {t(opsToolsLabel(OPS_TOOLS_SUGGESTION_STATUS_KEYS, s.status))}
                </span>
              </td>
              <td className="px-3 py-2.5">
                {s.linkedActionItemId ? (
                  <Link
                    href="/admin/ops-board"
                    className="text-signature hover:underline"
                  >
                    {s.linkedActionItemId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
