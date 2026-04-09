"use client";

import { REPORT_REASONS } from "@/lib/reports/report-utils";

interface ReportReasonSelectorProps {
  value: string;
  onChange: (code: string, label: string) => void;
}

export function ReportReasonSelector({ value, onChange }: ReportReasonSelectorProps) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-medium text-gray-700">신고 사유</p>
      <ul className="space-y-1">
        {REPORT_REASONS.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              onClick={() => onChange(r.code, r.label)}
              className={`w-full rounded-ui-rect border px-3 py-2.5 text-left text-[14px] ${
                value === r.code
                  ? "border-signature bg-signature/5 text-signature"
                  : "border-gray-200 text-gray-800"
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
