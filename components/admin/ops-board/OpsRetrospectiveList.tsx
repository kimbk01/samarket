"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsRetrospectives } from "@/lib/ops-board/ops-board-state";
import { OPS_TOOLS_SURFACE_KEYS, opsToolsLabel } from "@/components/admin/i18n/admin-ops-tools-label-keys";

export function OpsRetrospectiveList({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useI18n();
  const retros = useMemo(
    () => getOpsRetrospectives({ limit: 20 }),
    [refreshKey]
  );

  if (retros.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_ops_tools_board_retro_empty")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {retros.map((r) => (
        <div
          key={r.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-sam-fg">{r.title}</h3>
              <p className="mt-1 sam-text-body-secondary text-sam-muted">
                {r.retrospectiveDate} · {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, r.relatedSurface))}
                {r.relatedReportId &&
                  ` · ${t("admin_ops_tools_board_retro_report", { id: r.relatedReportId })}`}
              </p>
              <p className="mt-2 sam-text-body-secondary text-sam-fg line-clamp-2">
                {r.summary}
              </p>
            </div>
            <span className="sam-text-helper text-sam-muted">
              {r.createdByAdminNickname}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
