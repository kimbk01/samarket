"use client";

import { REPORT_REASONS } from "@/lib/reports/report-utils";

interface ReportReasonSelectorProps {
  value: string;
  onChange: (code: string, label: string) => void;
}

export function ReportReasonSelector({ value, onChange }: ReportReasonSelectorProps) {
  return (
    <div className="space-y-1">
      <p className="sam-text-body-secondary font-medium text-sam-fg">신고 사유</p>
      <ul className="space-y-1">
        {REPORT_REASONS.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              onClick={() => onChange(r.code, r.label)}
              className={`w-full rounded-ui-rect border px-3 py-2.5 text-left sam-text-body ${
                value === r.code
                  ? "border-signature bg-signature/5 text-signature"
                  : "border-sam-border text-sam-fg"
              }`}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
