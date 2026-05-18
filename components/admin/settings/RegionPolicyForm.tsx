"use client";

import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface RegionPolicyFormProps {
  values: Pick<
    AppSettings,
    "regionMultiSelectEnabled" | "maxSavedRegions" | "homeRadiusKm"
  >;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function RegionPolicyForm({ values, onChange }: RegionPolicyFormProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_region_intro")}</p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="regionMultiSelectEnabled"
          checked={values.regionMultiSelectEnabled}
          onChange={(e) =>
            onChange("regionMultiSelectEnabled", e.target.checked)
          }
          className="rounded border-sam-border"
        />
        <label
          htmlFor="regionMultiSelectEnabled"
          className="sam-text-body text-sam-fg"
        >
          {t("admin_settings_region_multi")}
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_region_max_saved")}
        </label>
        <input
          type="number"
          min={1}
          value={values.maxSavedRegions}
          onChange={(e) =>
            onChange("maxSavedRegions", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_settings_region_home_radius")}
        </label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={values.homeRadiusKm}
          onChange={(e) =>
            onChange("homeRadiusKm", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
    </div>
  );
}
