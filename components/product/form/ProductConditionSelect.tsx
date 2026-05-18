"use client";

import { PRODUCT_CONDITION_OPTIONS } from "@/lib/products/form-options";
import type { ProductCondition } from "@/lib/types/product-form";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ProductConditionSelectProps {
  value: ProductCondition;
  onChange: (v: ProductCondition) => void;
}

export function ProductConditionSelect({
  value,
  onChange,
}: ProductConditionSelectProps) {
  const { t } = useI18n();
  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-2 sam-text-body font-medium text-sam-fg">{t("ui_product_condition_label")}</p>
      <div className="flex flex-wrap gap-2">
        {PRODUCT_CONDITION_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`rounded-ui-rect border px-3 py-2 sam-text-body ${
              value === c.value
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border text-sam-muted"
            }`}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>
    </section>
  );
}
