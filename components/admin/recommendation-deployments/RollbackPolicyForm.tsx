"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getRollbackPolicies } from "@/lib/recommendation-deployments/mock-recommendation-rollback-policies";
import { saveRollbackPolicy } from "@/lib/recommendation-deployments/mock-recommendation-rollback-policies";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

export function RollbackPolicyForm() {
  const policies = useMemo(() => getRollbackPolicies(), []);
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [saved, setSaved] = useState(false);

  const policy = useMemo(
    () => policies.find((p) => p.surface === surface),
    [policies, surface]
  );

  const [autoRollbackEnabled, setAutoRollbackEnabled] = useState(
    policy?.autoRollbackEnabled ?? false
  );
  const [minCtrThreshold, setMinCtrThreshold] = useState(
    policy?.minCtrThreshold ?? 0.01
  );
  const [minConversionRateThreshold, setMinConversionRateThreshold] = useState(
    policy?.minConversionRateThreshold ?? 0.05
  );
  const [compareWindowHours, setCompareWindowHours] = useState(
    policy?.compareWindowHours ?? 24
  );
  const [adminMemo, setAdminMemo] = useState(policy?.adminMemo ?? "");

  const handleSave = () => {
    if (!policy) return;
    saveRollbackPolicy({
      id: policy.id,
      surface: policy.surface,
      autoRollbackEnabled,
      minCtrThreshold,
      minConversionRateThreshold,
      maxErrorRateThreshold: policy.maxErrorRateThreshold,
      compareWindowHours,
      adminMemo,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-600">
        자동 롤백 조건은 placeholder입니다. 수동 롤백은 운영 버전 탭에서 이전 버전으로 복원할 수 있습니다.
      </p>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          surface
        </label>
        <select
          value={surface}
          onChange={(e) => {
            const s = e.target.value as RecommendationSurface;
            setSurface(s);
            const p = policies.find((x) => x.surface === s);
            setAutoRollbackEnabled(p?.autoRollbackEnabled ?? false);
            setMinCtrThreshold(p?.minCtrThreshold ?? 0.01);
            setMinConversionRateThreshold(p?.minConversionRateThreshold ?? 0.05);
            setCompareWindowHours(p?.compareWindowHours ?? 24);
            setAdminMemo(p?.adminMemo ?? "");
          }}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {(["home", "search", "shop"] as const).map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoRollback"
          checked={autoRollbackEnabled}
          onChange={(e) => setAutoRollbackEnabled(e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="autoRollback" className="text-[14px] text-gray-700">
          자동 롤백 사용 (placeholder)
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-0.5 block text-[12px] text-gray-600">
            최소 CTR
          </label>
          <input
            type="number"
            step={0.01}
            min={0}
            value={minCtrThreshold}
            onChange={(e) =>
              setMinCtrThreshold(parseFloat(e.target.value) || 0)
            }
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-[14px]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[12px] text-gray-600">
            최소 전환율
          </label>
          <input
            type="number"
            step={0.01}
            min={0}
            value={minConversionRateThreshold}
            onChange={(e) =>
              setMinConversionRateThreshold(parseFloat(e.target.value) || 0)
            }
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-[14px]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[12px] text-gray-600">
            비교 구간(시간)
          </label>
          <input
            type="number"
            min={1}
            value={compareWindowHours}
            onChange={(e) =>
              setCompareWindowHours(Number(e.target.value) || 24)
            }
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-[14px]"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          메모
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
      >
        {saved ? "저장됨" : "저장"}
      </button>
    </div>
  );
}
