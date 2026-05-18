"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { REPORT_REASONS } from "@/lib/reports/report-utils";

interface ReportReasonSelectorProps {
  value: string;
  onChange: (code: string, label: string) => void;
}

export function ReportReasonSelector({ value, onChange }: ReportReasonSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <p className="sam-text-body-secondary font-medium text-sam-fg">{t("ui_report_reason_title")}</p>
      <ul className="space-y-1">
        {REPORT_REASONS.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              onClick={() => onChange(r.code, t(r.labelKey))}
              className={`w-full rounded-ui-rect border px-3 py-2.5 text-left sam-text-body ${
                value === r.code
                  ? "border-signature bg-signature/5 text-signature"
                  : "border-sam-border text-sam-fg"
              }`}
            >
              {t(r.labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
