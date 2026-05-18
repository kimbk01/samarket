"use client";

import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ReportPolicyFormProps {
  values: Pick<AppSettings, "reportEnabled" | "maxReportsPerTarget">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ReportPolicyForm({ values, onChange }: ReportPolicyFormProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_report_intro")}</p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="reportEnabled"
          checked={values.reportEnabled}
          onChange={(e) => onChange("reportEnabled", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="reportEnabled" className="sam-text-body text-sam-fg">
          {t("admin_settings_report_enabled")}
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_report_max_per_target")}
        </label>
        <input
          type="number"
          min={1}
          value={values.maxReportsPerTarget}
          onChange={(e) =>
            onChange("maxReportsPerTarget", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <p className="sam-text-helper text-sam-meta">reportReasonOptions (placeholder)</p>
    </div>
  );
}
