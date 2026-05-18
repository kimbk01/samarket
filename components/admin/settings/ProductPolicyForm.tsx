"use client";

import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_product_intro")}</p>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_product_auto_expire")}
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
          {t("admin_settings_product_max_images")}
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
          {t("admin_settings_product_allow_offer")}
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
          {t("admin_settings_product_allow_boost")}
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_product_boost_cooldown")}
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
