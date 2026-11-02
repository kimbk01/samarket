"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { REPORT_REASONS } from "@/lib/reports/report-utils";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface ReportReasonSelectorProps {
  value: string;
  onChange: (code: string, label: string) => void;
}

export function ReportReasonSelector({ value, onChange }: ReportReasonSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">
        {t("ui_report_reason_title")}
      </p>
      <ul className="space-y-2">
        {REPORT_REASONS.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              onClick={() => onChange(r.code, t(r.labelKey))}
              data-selected={value === r.code ? "true" : undefined}
              className={OverlayUi.selectCard}
            >
              {t(r.labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
