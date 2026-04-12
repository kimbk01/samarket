"use client";

import { useMemo } from "react";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel } from "@/lib/utils/format";

interface ProductPriceFieldProps {
  value: string;
  onChange: (v: string) => void;
  isPriceOfferEnabled: boolean;
  onPriceOfferChange: (v: boolean) => void;
  error?: string;
}

export function ProductPriceField({
  value,
  onChange,
  isPriceOfferEnabled,
  onPriceOfferChange,
  error,
}: ProductPriceFieldProps) {
  const unit = useMemo(() => getCurrencyUnitLabel(getAppSettings().defaultCurrency), []);
  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <label className="mb-2 block text-[14px] font-medium text-sam-fg">
        가격 <span className="text-red-500">*</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="0"
          className="flex-1 rounded-ui-rect border border-sam-border px-3 py-2.5 text-[15px] text-sam-fg"
          aria-invalid={!!error}
        />
        <span className="text-[15px] text-sam-muted">{unit}</span>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[14px] text-sam-muted">
        <input
          type="checkbox"
          checked={isPriceOfferEnabled}
          onChange={(e) => onPriceOfferChange(e.target.checked)}
          className="rounded border-sam-border"
        />
        가격 제안 가능
      </label>
      {error && <p className="mt-1 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
