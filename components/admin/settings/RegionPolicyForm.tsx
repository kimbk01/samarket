"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  normalizeTradeDefaultRadiusKm,
  normalizeTradeRadiusOptionsKm,
} from "@/lib/trade/location/trade-radius-options";

interface RegionPolicyFormProps {
  values: Pick<
    AppSettings,
    | "regionMultiSelectEnabled"
    | "maxSavedRegions"
    | "homeRadiusKm"
    | "tradeRadiusOptionsKm"
    | "tradeDefaultRadiusKm"
  >;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function RegionPolicyForm({ values, onChange }: RegionPolicyFormProps) {
  const { t } = useI18n();
  /** 거래 D: 반경 선택지 — 입력 중에는 글자 그대로, 칸을 벗어날 때 정리(오름차순·중복 제거·1~500km) */
  const tradeOptions = normalizeTradeRadiusOptionsKm(values.tradeRadiusOptionsKm);
  const [optionsText, setOptionsText] = useState(() => tradeOptions.join(", "));
  const optionsKey = tradeOptions.join(",");
  useEffect(() => {
    setOptionsText(optionsKey.split(",").join(", "));
  }, [optionsKey]);
  const commitOptions = () => {
    const next = normalizeTradeRadiusOptionsKm(optionsText.split(/[\s,]+/).filter(Boolean));
    onChange("tradeRadiusOptionsKm", next);
    onChange("tradeDefaultRadiusKm", normalizeTradeDefaultRadiusKm(values.tradeDefaultRadiusKm, next));
    setOptionsText(next.join(", "));
  };
  const defaultRadius = normalizeTradeDefaultRadiusKm(values.tradeDefaultRadiusKm, tradeOptions);

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
      <div>
        <label
          htmlFor="tradeRadiusOptionsKm"
          className="block sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("admin_settings_region_trade_radius_options")}
        </label>
        <input
          id="tradeRadiusOptionsKm"
          type="text"
          inputMode="numeric"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          onBlur={commitOptions}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_settings_region_trade_radius_options_hint")}
        </p>
      </div>
      <div>
        <label
          htmlFor="tradeDefaultRadiusKm"
          className="block sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("admin_settings_region_trade_default_radius")}
        </label>
        <select
          id="tradeDefaultRadiusKm"
          value={defaultRadius == null ? "" : String(defaultRadius)}
          onChange={(e) =>
            onChange(
              "tradeDefaultRadiusKm",
              e.target.value ? normalizeTradeDefaultRadiusKm(e.target.value, tradeOptions) : null
            )
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        >
          <option value="">{t("admin_settings_region_trade_radius_all")}</option>
          {tradeOptions.map((km) => (
            <option key={km} value={String(km)}>
              {km}km
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
