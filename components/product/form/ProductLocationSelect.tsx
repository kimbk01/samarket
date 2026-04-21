"use client";

import { REGIONS } from "@/lib/products/form-options";

interface ProductLocationSelectProps {
  region: string;
  city: string;
  onRegionChange: (v: string) => void;
  onCityChange: (v: string) => void;
  error?: string;
}

export function ProductLocationSelect({
  region,
  city,
  onRegionChange,
  onCityChange,
  error,
}: ProductLocationSelectProps) {
  const selectedRegion = REGIONS.find((r) => r.id === region);
  const cities = selectedRegion?.cities ?? [];

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-2 sam-text-body font-medium text-sam-fg">
        거래 지역 <span className="text-red-500">*</span>
      </p>
      <div className="space-y-3">
        <select
          value={region}
          onChange={(e) => {
            onRegionChange(e.target.value);
            onCityChange("");
          }}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
          aria-invalid={!!error}
        >
          <option value="">Select region</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
          disabled={!region}
          aria-invalid={!!error}
        >
          <option value="">Select area</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-1 sam-text-body-secondary text-red-500">{error}</p>}
    </section>
  );
}
