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
    <section className="border-b border-gray-100 bg-white px-4 py-4">
      <p className="mb-2 text-[14px] font-medium text-gray-800">상품 상태</p>
      <div className="flex flex-wrap gap-2">
        {CONDITIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`rounded-lg border px-3 py-2 text-[14px] ${
              value === c.value
                ? "border-signature bg-signature/10 text-signature"
                : "border-gray-300 text-gray-600"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
