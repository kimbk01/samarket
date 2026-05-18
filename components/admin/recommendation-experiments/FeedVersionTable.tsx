"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { FeedVersion } from "@/lib/types/recommendation-experiment";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

interface FeedVersionTableProps {
  versions: FeedVersion[];
  onEdit?: (v: FeedVersion) => void;
}

export function FeedVersionTable({
  versions,
  onEdit,
}: FeedVersionTableProps) {
  const { t } = useI18n();

  if (versions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_exp_empty_versions")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_exp_label_version_name")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_section_count")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_score_override")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_status")}
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_th_work")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr
              key={v.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {v.versionName}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recSurfaceLabel(t, v.surface)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {v.sectionConfig.filter((s) => s.isActive).length} / {v.sectionConfig.length}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {Object.keys(v.scoringOverrides).length
                  ? Object.entries(v.scoringOverrides)
                      .map(([k, val]) => `${k}:${val}`)
                      .join(", ")
                  : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    v.isActive ? "bg-emerald-50 text-emerald-800" : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {v.isActive ? t("admin_rec_exp_status_active") : t("admin_rec_exp_status_inactive")}
                </span>
              </td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(v)}
                    className="sam-text-body-secondary text-signature hover:underline"
                  >
                    {t("common_edit")}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
