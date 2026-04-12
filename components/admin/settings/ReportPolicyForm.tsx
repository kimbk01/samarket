"use client";

import type { AppSettings } from "@/lib/types/admin-settings";

interface ReportPolicyFormProps {
  values: Pick<AppSettings, "reportEnabled" | "maxReportsPerTarget">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ReportPolicyForm({ values, onChange }: ReportPolicyFormProps) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-sam-muted">
        신고 정책 (11·12단계 연동 placeholder)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="reportEnabled"
          checked={values.reportEnabled}
          onChange={(e) => onChange("reportEnabled", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="reportEnabled" className="text-[14px] text-sam-fg">
          신고 기능 사용
        </label>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-sam-fg">
          대상당 최대 신고 수
        </label>
        <input
          type="number"
          min={1}
          value={values.maxReportsPerTarget}
          onChange={(e) =>
            onChange("maxReportsPerTarget", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 text-[14px] text-sam-fg"
        />
      </div>
      <p className="text-[12px] text-sam-meta">
        reportReasonOptions (placeholder)
      </p>
    </div>
  );
}
