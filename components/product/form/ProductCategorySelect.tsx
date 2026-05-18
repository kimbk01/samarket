"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
  const [options, setOptions] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    getCategories({ type: "trade", activeOnly: true }).then(setOptions);
  }, []);

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <label className="mb-2 block sam-text-body font-medium text-sam-fg">
        {t("ui_product_category_label")} <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
        aria-invalid={!!error}
      >
        <option value="">{t("ui_product_category_select")}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 sam-text-body-secondary text-red-500">{error}</p>}
    </section>
  );
}
