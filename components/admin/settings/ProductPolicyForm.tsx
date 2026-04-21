"use client";

import type { AppSettings } from "@/lib/types/admin-settings";

interface ProductPolicyFormProps {
  values: Pick<
    AppSettings,
    | "productAutoExpireDays"
    | "maxProductImages"
    | "allowPriceOffer"
    | "allowProductBoost"
    | "boostCooldownHours"
  >;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ProductPolicyForm({ values, onChange }: ProductPolicyFormProps) {
  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        상품 등록·노출 정책 (4·5단계 연동 placeholder)
      </p>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          상품 자동 만료 일수
        </label>
        <input
          type="number"
          min={1}
          value={values.productAutoExpireDays}
          onChange={(e) =>
            onChange("productAutoExpireDays", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          최대 상품 이미지 수
        </label>
        <input
          type="number"
          min={1}
          value={values.maxProductImages}
          onChange={(e) =>
            onChange("maxProductImages", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allowPriceOffer"
          checked={values.allowPriceOffer}
          onChange={(e) => onChange("allowPriceOffer", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="allowPriceOffer" className="sam-text-body text-sam-fg">
          가격 제안 허용
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allowProductBoost"
          checked={values.allowProductBoost}
          onChange={(e) => onChange("allowProductBoost", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="allowProductBoost" className="sam-text-body text-sam-fg">
          끌올 허용
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          끌올 쿨다운 (시간)
        </label>
        <input
          type="number"
          min={0}
          value={values.boostCooldownHours}
          onChange={(e) =>
            onChange("boostCooldownHours", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
    </div>
  );
}
