"use client";

import { useMemo } from "react";
import { formatPriceInput } from "@/lib/utils/format";
import {
  USED_CAR_BRANDS,
  USED_CAR_BRAND_OTHER_KEY,
  buildCarModelLineFromKeys,
  buildUsedCarYearSelectOptions,
  labelForUsedCarMileagePresetKey,
  USED_CAR_MILEAGE_PRESETS,
  USED_CAR_MILEAGE_CUSTOM_KEY,
  usedCarBrandOptionLabel,
  usedCarModelOptionLabel,
} from "@/lib/trade/used-car-form-catalog";
import { getTradeOptionCatalog } from "@/lib/trade/category-form/option-catalogs";
import { TRADE_WRITE_FB_CONTROL, TRADE_WRITE_FB_FIELD_LABEL } from "@/lib/ui/trade-write-fb-ui";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type UsedCarSellFieldsErrors = {
  carYear?: string;
  carModel?: string;
  mileage?: string;
};

type UsedCarSellFieldsProps = {
  carModel: string;
  setCarModel: (v: string) => void;
  carYear: string;
  setCarYear: (v: string) => void;
  mileage: string;
  setMileage: (v: string) => void;
  brandKey: string;
  setBrandKey: (v: string) => void;
  modelKey: string;
  setModelKey: (v: string) => void;
  mileagePresetKey: string;
  setMileagePresetKey: (v: string) => void;
  transmission: string;
  setTransmission: (v: string) => void;
  fuelType: string;
  setFuelType: (v: string) => void;
  errors: UsedCarSellFieldsErrors;
  /** Rent-car reuses brand/model/year UI without odometer mileage */
  showMileage?: boolean;
};

export function UsedCarSellFields({
  carModel,
  setCarModel,
  carYear,
  setCarYear,
  mileage,
  setMileage,
  brandKey,
  setBrandKey,
  modelKey,
  setModelKey,
  mileagePresetKey,
  setMileagePresetKey,
  transmission,
  setTransmission,
  fuelType,
  setFuelType,
  errors,
  showMileage = true,
}: UsedCarSellFieldsProps) {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const yearOpts = useMemo(() => buildUsedCarYearSelectOptions(), []);
  const brand = USED_CAR_BRANDS.find((b) => b.key === brandKey);
  const models = brand?.models ?? [];
  const transmissionOpts = getTradeOptionCatalog("vehicle_transmission");
  const fuelOpts = getTradeOptionCatalog("vehicle_fuel_type");

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
            {t("trade_write_brand")} <span className="text-sam-danger">*</span>
          </label>
          <select
            value={brandKey}
            onChange={(e) => {
              const next = e.target.value;
              setBrandKey(next);
              setModelKey("");
              setCarModel("");
            }}
            className={TRADE_WRITE_FB_CONTROL}
            aria-invalid={!!errors.carModel && !brandKey}
          >
            <option value="">{t("trade_075")}</option>
            {USED_CAR_BRANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {usedCarBrandOptionLabel(t, b.key, b.label)}
              </option>
            ))}
          </select>
        </div>

        {brandKey && brandKey !== USED_CAR_BRAND_OTHER_KEY ? (
          <div className="min-w-0">
            <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
              {t("trade_write_model")} <span className="text-sam-danger">*</span>
            </label>
            <select
              value={modelKey}
              onChange={(e) => {
                const next = e.target.value;
                setModelKey(next);
                const line = buildCarModelLineFromKeys(brandKey, next);
                if (line) setCarModel(line);
              }}
              className={TRADE_WRITE_FB_CONTROL}
              aria-invalid={!!errors.carModel && !modelKey}
            >
              <option value="">{t("trade_075")}</option>
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {usedCarModelOptionLabel(t, m.key, m.label)}
                </option>
              ))}
            </select>
          </div>
        ) : brandKey === USED_CAR_BRAND_OTHER_KEY ? (
          <div className="min-w-0 sm:col-span-1">
            <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
              {t("trade_write_body_type")} <span className="text-sam-danger">*</span>
            </label>
            <input
              type="text"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder=""
              className={TRADE_WRITE_FB_CONTROL}
              aria-invalid={!!errors.carModel}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
            {t("trade_write_year")} <span className="text-sam-danger">*</span>
          </label>
          <select
            value={carYear.replace(/\D/g, "").length === 4 ? carYear.replace(/\D/g, "").slice(0, 4) : ""}
            onChange={(e) => setCarYear(e.target.value)}
            className={TRADE_WRITE_FB_CONTROL}
            aria-invalid={!!errors.carYear}
          >
            {yearOpts.map((opt) => (
              <option key={opt.value || "empty"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.carYear ? <p className="mt-1 sam-text-helper text-sam-danger">{errors.carYear}</p> : null}
        </div>

        {showMileage ? (
          <div className="min-w-0">
            <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
              {t("trade_write_mileage")} <span className="text-sam-danger">*</span>
            </label>
            <select
              value={mileagePresetKey}
              onChange={(e) => {
                const k = e.target.value;
                setMileagePresetKey(k);
                if (k && k !== USED_CAR_MILEAGE_CUSTOM_KEY) {
                  const p = USED_CAR_MILEAGE_PRESETS.find((x) => x.key === k);
                  if (p) setMileage(formatPriceInput(p.digits));
                }
              }}
              className={TRADE_WRITE_FB_CONTROL}
              aria-invalid={!!errors.mileage}
            >
              <option value="">{t("trade_075")}</option>
              {USED_CAR_MILEAGE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {labelForUsedCarMileagePresetKey(p.key, t)}
                </option>
              ))}
              <option value={USED_CAR_MILEAGE_CUSTOM_KEY}>{t("trade_109")}</option>
            </select>
            {mileagePresetKey === USED_CAR_MILEAGE_CUSTOM_KEY ? (
              <input
                type="text"
                inputMode="numeric"
                value={mileage}
                onChange={(e) => setMileage(formatPriceInput(e.target.value))}
                placeholder=""
                className={`mt-1.5 ${TRADE_WRITE_FB_CONTROL}`}
                aria-invalid={!!errors.mileage}
              />
            ) : null}
            {errors.mileage ? <p className="mt-1 sam-text-helper text-sam-danger">{errors.mileage}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>{t("ui_meta_transmission")}</label>
          <select
            value={transmission}
            onChange={(e) => setTransmission(e.target.value)}
            className={TRADE_WRITE_FB_CONTROL}
          >
            <option value="">{t("trade_075")}</option>
            {transmissionOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {lang === "en" ? o.labelEn : o.labelKo}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>{t("ui_meta_fuel_type")}</label>
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={TRADE_WRITE_FB_CONTROL}>
            <option value="">{t("trade_075")}</option>
            {fuelOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {lang === "en" ? o.labelEn : o.labelKo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errors.carModel ? <p className="sam-text-helper text-sam-danger">{errors.carModel}</p> : null}
    </div>
  );
}
