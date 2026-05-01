"use client";

import { useMemo } from "react";
import { formatPriceInput } from "@/lib/utils/format";
import {
  USED_CAR_BRANDS,
  USED_CAR_BRAND_OTHER_KEY,
  buildCarModelLineFromKeys,
  buildUsedCarYearSelectOptions,
  USED_CAR_MILEAGE_PRESETS,
  USED_CAR_MILEAGE_CUSTOM_KEY,
} from "@/lib/trade/used-car-form-catalog";

const SELECT_ROW_CLASS =
  "h-11 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body";

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
  errors: UsedCarSellFieldsErrors;
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
  errors,
}: UsedCarSellFieldsProps) {
  const yearOpts = useMemo(() => buildUsedCarYearSelectOptions(), []);
  const brand = USED_CAR_BRANDS.find((b) => b.key === brandKey);
  const models = brand?.models ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
            브랜드 <span className="text-sam-danger">*</span>
          </label>
          <select
            value={brandKey}
            onChange={(e) => {
              const next = e.target.value;
              setBrandKey(next);
              setModelKey("");
              setCarModel("");
            }}
            className={SELECT_ROW_CLASS}
            aria-invalid={!!errors.carModel && !brandKey}
          >
            <option value="">선택</option>
            {USED_CAR_BRANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {brandKey && brandKey !== USED_CAR_BRAND_OTHER_KEY ? (
          <div className="min-w-0">
            <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
              모델 <span className="text-sam-danger">*</span>
            </label>
            <select
              value={modelKey}
              onChange={(e) => {
                const next = e.target.value;
                setModelKey(next);
                const line = buildCarModelLineFromKeys(brandKey, next);
                if (line) setCarModel(line);
              }}
              className={SELECT_ROW_CLASS}
              aria-invalid={!!errors.carModel && !modelKey}
            >
              <option value="">선택</option>
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ) : brandKey === USED_CAR_BRAND_OTHER_KEY ? (
          <div className="min-w-0 sm:col-span-1">
            <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
              차종 <span className="text-sam-danger">*</span>
            </label>
            <input
              type="text"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder="브랜드·모델을 입력해 주세요"
              className={SELECT_ROW_CLASS}
              aria-invalid={!!errors.carModel}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
            연식 <span className="text-sam-danger">*</span>
          </label>
          <select
            value={carYear.replace(/\D/g, "").length === 4 ? carYear.replace(/\D/g, "").slice(0, 4) : ""}
            onChange={(e) => setCarYear(e.target.value)}
            className={SELECT_ROW_CLASS}
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

        <div className="min-w-0">
          <label className="mb-1 block min-h-[20px] sam-text-body-secondary text-sam-fg">
            주행거리 <span className="text-sam-danger">*</span>
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
            className={SELECT_ROW_CLASS}
            aria-invalid={!!errors.mileage}
          >
            <option value="">선택</option>
            {USED_CAR_MILEAGE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value={USED_CAR_MILEAGE_CUSTOM_KEY}>직접 입력</option>
          </select>
          {mileagePresetKey === USED_CAR_MILEAGE_CUSTOM_KEY ? (
            <input
              type="text"
              inputMode="numeric"
              value={mileage}
              onChange={(e) => setMileage(formatPriceInput(e.target.value))}
              placeholder="예: 73,500"
              className={`mt-2 ${SELECT_ROW_CLASS}`}
              aria-invalid={!!errors.mileage}
            />
          ) : null}
          {errors.mileage ? <p className="mt-1 sam-text-helper text-sam-danger">{errors.mileage}</p> : null}
        </div>
      </div>

      {errors.carModel ? <p className="sam-text-helper text-sam-danger">{errors.carModel}</p> : null}
    </div>
  );
}
