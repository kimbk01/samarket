"use client";

import { CONDITIONS } from "@/lib/products/form-options";
import type { ProductCondition } from "@/lib/types/product-form";

interface ProductConditionSelectProps {
  value: ProductCondition;
  onChange: (v: ProductCondition) => void;
}

export function ProductConditionSelect({
  value,
  onChange,
}: ProductConditionSelectProps) {
  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-2 sam-text-body font-medium text-sam-fg">상품 상태</p>
      <div className="flex flex-wrap gap-2">
        {CONDITIONS.map((c) => (
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
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
