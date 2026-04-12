"use client";

import { useCallback, useEffect, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/types/category";

interface ProductCategorySelectProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

/** 거래(trade) 카테고리만 표시, sort_order 적용 */
export function ProductCategorySelect({
  value,
  onChange,
  error,
}: ProductCategorySelectProps) {
  const [options, setOptions] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    getCategories({ type: "trade", activeOnly: true }).then(setOptions);
  }, []);

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <label className="mb-2 block text-[14px] font-medium text-sam-fg">
        카테고리 <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-[15px] text-sam-fg"
        aria-invalid={!!error}
      >
        <option value="">선택</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
