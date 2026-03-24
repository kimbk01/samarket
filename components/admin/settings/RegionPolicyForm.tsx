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
      <p className="text-[13px] text-gray-500">
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
          className="rounded border-gray-300"
        />
        <label
          htmlFor="regionMultiSelectEnabled"
          className="text-[14px] text-gray-700"
        >
          동네 여러 개 선택 허용
        </label>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-gray-700">
          최대 저장 동네 수
        </label>
        <input
          type="number"
          min={1}
          value={values.maxSavedRegions}
          onChange={(e) =>
            onChange("maxSavedRegions", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-gray-700">
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
          className="mt-1 w-full max-w-xs rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
        />
      </div>
    </div>
  );
}
