"use client";

import { useState } from "react";
import { REGIONS } from "@/lib/products/form-options";

export interface RegionSelection {
  regionId: string;
  cityId: string;
  barangay: string;
}

interface RegionSelectorFormProps {
  initialRegionId?: string;
  initialCityId?: string;
  onSubmit: (regionId: string, cityId: string, barangay: string, setAsPrimary: boolean) => void;
  onCancel: () => void;
}

export function RegionSelectorForm({
  initialRegionId = "",
  initialCityId = "",
  onSubmit,
  onCancel,
}: RegionSelectorFormProps) {
  const [regionId, setRegionId] = useState(initialRegionId);
  const [cityId, setCityId] = useState(initialCityId);
  const [barangay, setBarangay] = useState("");
  const [setAsPrimary, setSetAsPrimary] = useState(true);

  const region = REGIONS.find((r) => r.id === regionId);
  const cities = region?.cities ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regionId || !cityId) return;
    onSubmit(regionId, cityId, barangay.trim(), setAsPrimary);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
          지역
        </label>
        <select
          value={regionId}
          onChange={(e) => {
            setRegionId(e.target.value);
            setCityId("");
          }}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
        >
          <option value="">Select region</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
          Area
        </label>
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          disabled={!regionId}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
        >
          <option value="">Select area</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
          바랑가이 (선택)
        </label>
        <input
          type="text"
          value={barangay}
          onChange={(e) => setBarangay(e.target.value)}
          placeholder=""
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
        />
      </div>
      <label className="flex items-center gap-2 sam-text-body text-sam-fg">
        <input
          type="checkbox"
          checked={setAsPrimary}
          onChange={(e) => setSetAsPrimary(e.target.checked)}
          className="rounded border-sam-border"
        />
        대표 동네로 설정
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-ui-rect border border-sam-border px-4 py-2.5 sam-text-body text-sam-muted"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!regionId || !cityId}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </form>
  );
}
