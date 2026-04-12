"use client";

import { useState } from "react";
import type { ExposureScorePolicy, ExposureSurface } from "@/lib/types/exposure";
import { SURFACE_OPTIONS } from "@/lib/exposure/exposure-policy-utils";

interface ExposurePolicyFormProps {
  initial?: Partial<ExposureScorePolicy> | null;
  onSubmit: (values: Partial<ExposureScorePolicy>) => void;
  onCancel?: () => void;
}

const defaultWeights = {
  latestWeight: 1,
  popularWeight: 0.8,
  nearbyWeight: 0.6,
  premiumBoostWeight: 10,
  businessBoostWeight: 5,
  adBoostWeight: 20,
  pointPromotionBoostWeight: 15,
  bumpBoostWeight: 8,
  exactRegionMatchWeight: 12,
  sameCityWeight: 6,
  sameBarangayWeight: 10,
};

export function ExposurePolicyForm({
  initial,
  onSubmit,
  onCancel,
}: ExposurePolicyFormProps) {
  const [surface, setSurface] = useState<ExposureSurface>(
    initial?.surface ?? "home"
  );
  const [policyName, setPolicyName] = useState(initial?.policyName ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [weights, setWeights] = useState({
    ...defaultWeights,
    ...initial,
  });
  const [adminMemo, setAdminMemo] = useState(initial?.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial?.id,
      surface,
      policyName,
      isActive,
      ...weights,
      adminMemo,
    });
  };

  const updateWeight = (key: keyof typeof weights, value: number) => {
    setWeights((w) => ({ ...w, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          surface
        </label>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value as ExposureSurface)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {SURFACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          정책명
        </label>
        <input
          type="text"
          value={policyName}
          onChange={(e) => setPolicyName(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="expActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="expActive" className="text-[14px] text-sam-fg">
          활성
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            "latestWeight",
            "popularWeight",
            "nearbyWeight",
            "premiumBoostWeight",
            "businessBoostWeight",
            "adBoostWeight",
            "pointPromotionBoostWeight",
            "bumpBoostWeight",
            "exactRegionMatchWeight",
            "sameCityWeight",
            "sameBarangayWeight",
          ] as const
        ).map((key) => (
          <div key={key}>
            <label className="mb-0.5 block text-[12px] text-sam-muted">
              {key.replace(/Weight|BoostWeight|MatchWeight/g, "")}
            </label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={weights[key]}
              onChange={(e) =>
                updateWeight(key, parseFloat(e.target.value) || 0)
              }
              className="w-full rounded border border-sam-border px-2 py-1.5 text-[14px]"
            />
          </div>
        ))}
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          관리자 메모
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          저장
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 text-[14px] text-sam-fg"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
