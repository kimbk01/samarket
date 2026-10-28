"use client";

import { useMemo } from "react";
import { WriteSelectSheetField } from "@/components/write/shared/WriteSelectSheetField";
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
  /** Composition-active field ids. Omitted = all visible (seed). */
  enabledFieldIds?: ReadonlySet<string>;
};

function compositionFieldOn(ids: ReadonlySet<string> | undefined, id: string): boolean {
  return !ids || ids.has(id);
}

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
  enabledFieldIds,
}: UsedCarSellFieldsProps) {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const yearOpts = useMemo(() => buildUsedCarYearSelectOptions(), []);
  const brand = USED_CAR_BRANDS.find((b) => b.key === brandKey);
  const models = brand?.models ?? [];
  const transmissionOpts = getTradeOptionCatalog("vehicle_transmission");
  const fuelOpts = getTradeOptionCatalog("vehicle_fuel_type");
  const showMake = compositionFieldOn(enabledFieldIds, "make");
  const showModel = compositionFieldOn(enabledFieldIds, "model");
  const showYear = compositionFieldOn(enabledFieldIds, "year");
  const showOdometer = showMileage && compositionFieldOn(enabledFieldIds, "mileage");
  const showTransmission = compositionFieldOn(enabledFieldIds, "transmission");
  const showFuel = compositionFieldOn(enabledFieldIds, "fuel_type");

  return (
    <div className="space-y-2">
      {showMake || showModel ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {showMake ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
                {t("trade_write_brand")} <span className="text-sam-danger">*</span>
              </label>
              <WriteSelectSheetField
                value={brandKey}
                onChange={(next) => {
                  setBrandKey(next);
                  setModelKey("");
                  setCarModel("");
                }}
                options={USED_CAR_BRANDS.map((b) => ({ value: b.key, label: usedCarBrandOptionLabel(t, b.key, b.label) }))}
                placeholder={t("trade_075")}
                sheetTitle={t("trade_write_brand")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
                invalid={!!errors.carModel && !brandKey}
              />
            </div>
          ) : null}

          {showModel && brandKey && brandKey !== USED_CAR_BRAND_OTHER_KEY ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
                {t("trade_write_model")} <span className="text-sam-danger">*</span>
              </label>
              <WriteSelectSheetField
                value={modelKey}
                onChange={(next) => {
                  setModelKey(next);
                  const line = buildCarModelLineFromKeys(brandKey, next);
                  if (line) setCarModel(line);
                }}
                options={models.map((m) => ({ value: m.key, label: usedCarModelOptionLabel(t, m.key, m.label) }))}
                placeholder={t("trade_075")}
                sheetTitle={t("trade_write_model")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
                invalid={!!errors.carModel && !modelKey}
              />
            </div>
          ) : showModel && brandKey === USED_CAR_BRAND_OTHER_KEY ? (
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
      ) : null}

      {showYear || showOdometer ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {showYear ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
                {t("trade_write_year")} <span className="text-sam-danger">*</span>
              </label>
              <WriteSelectSheetField
                value={carYear.replace(/\D/g, "").length === 4 ? carYear.replace(/\D/g, "").slice(0, 4) : ""}
                onChange={setCarYear}
                options={yearOpts.filter((o) => o.value)}
                placeholder={yearOpts[0]?.label ?? t("trade_075")}
                sheetTitle={t("trade_write_year")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
                invalid={!!errors.carYear}
              />
              {errors.carYear ? <p className="mt-1 sam-text-helper text-sam-danger">{errors.carYear}</p> : null}
            </div>
          ) : null}

          {showOdometer ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>
                {t("trade_write_mileage")} <span className="text-sam-danger">*</span>
              </label>
              <WriteSelectSheetField
                value={mileagePresetKey}
                onChange={(k) => {
                  setMileagePresetKey(k);
                  if (k && k !== USED_CAR_MILEAGE_CUSTOM_KEY) {
                    const p = USED_CAR_MILEAGE_PRESETS.find((x) => x.key === k);
                    if (p) setMileage(formatPriceInput(p.digits));
                  }
                }}
                options={[
                  ...USED_CAR_MILEAGE_PRESETS.map((p) => ({ value: p.key, label: labelForUsedCarMileagePresetKey(p.key, t) })),
                  { value: USED_CAR_MILEAGE_CUSTOM_KEY, label: t("trade_109") },
                ]}
                placeholder={t("trade_075")}
                sheetTitle={t("trade_write_mileage")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
                invalid={!!errors.mileage}
              />
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
      ) : null}

      {showTransmission || showFuel ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {showTransmission ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>{t("ui_meta_transmission")}</label>
              <WriteSelectSheetField
                value={transmission}
                onChange={setTransmission}
                options={transmissionOpts.map((o) => ({ value: o.value, label: lang === "en" ? o.labelEn : o.labelKo }))}
                placeholder={t("trade_075")}
                sheetTitle={t("ui_meta_transmission")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
              />
            </div>
          ) : null}
          {showFuel ? (
            <div className="min-w-0">
              <label className={`${TRADE_WRITE_FB_FIELD_LABEL} min-h-[18px]`}>{t("ui_meta_fuel_type")}</label>
              <WriteSelectSheetField
                value={fuelType}
                onChange={setFuelType}
                options={fuelOpts.map((o) => ({ value: o.value, label: lang === "en" ? o.labelEn : o.labelKo }))}
                placeholder={t("trade_075")}
                sheetTitle={t("ui_meta_fuel_type")}
                clearable
                className={TRADE_WRITE_FB_CONTROL}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {errors.carModel ? <p className="sam-text-helper text-sam-danger">{errors.carModel}</p> : null}
    </div>
  );
}
