"use client";

import type { AppSettings } from "@/lib/types/admin-settings";

interface RegionPolicyFormProps {
  values: Pick<
    AppSettings,
    "regionMultiSelectEnabled" | "maxSavedRegions" | "homeRadiusKm"
  >;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function RegionPolicyForm({ values, onChange }: RegionPolicyFormProps) {
  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        지역·노출 정책 (8·9단계 연동 placeholder)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="regionMultiSelectEnabled"
          checked={values.regionMultiSelectEnabled}
          onChange={(e) =>
            onChange("regionMultiSelectEnabled", e.target.checked)
          }
          className="rounded border-sam-border"
        />
        <label
          htmlFor="regionMultiSelectEnabled"
          className="sam-text-body text-sam-fg"
        >
          동네 여러 개 선택 허용
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          최대 저장 동네 수
        </label>
        <input
          type="number"
          min={1}
          value={values.maxSavedRegions}
          onChange={(e) =>
            onChange("maxSavedRegions", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          홈 노출 반경 (km)
        </label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={values.homeRadiusKm}
          onChange={(e) =>
            onChange("homeRadiusKm", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
    </div>
  );
}
