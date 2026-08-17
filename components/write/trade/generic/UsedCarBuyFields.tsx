"use client";

import { useMemo } from "react";
import {
  USED_CAR_BODY_TYPES,
  buildUsedCarYearSelectOptions,
  labelForUsedCarBodyTypeKey,
} from "@/lib/trade/used-car-form-catalog";
import { formatPriceInput } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  TRADE_WRITE_FB_CONTROL,
  TRADE_WRITE_FB_CONTROL_ROW,
  TRADE_WRITE_FB_FIELD_LABEL,
} from "@/lib/ui/trade-write-fb-ui";

export type UsedCarBuyFieldsErrors = {
  bodyType?: string;
  carYear?: string;
  price?: string;
};

type Props = {
  bodyTypeKey: string;
  setBodyTypeKey: (v: string) => void;
  carYear: string;
  setCarYear: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  currencyUnitLabel: string;
  isPriceOfferEnabled: boolean;
  setIsPriceOfferEnabled: (v: boolean) => void;
  allowPriceOffer: boolean;
  errors: UsedCarBuyFieldsErrors;
  disabled?: boolean;
};

export function UsedCarBuyFields({
  bodyTypeKey,
  setBodyTypeKey,
  carYear,
  setCarYear,
  price,
  setPrice,
  currencyUnitLabel,
  isPriceOfferEnabled,
  setIsPriceOfferEnabled,
  allowPriceOffer,
  errors,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const yearOpts = useMemo(() => buildUsedCarYearSelectOptions(t), [t]);
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={TRADE_WRITE_FB_FIELD_LABEL}>
            {t("used_car_body_type_label")} <span className="text-sam-danger">*</span>
          </label>
          <select
            value={bodyTypeKey}
            onChange={(e) => setBodyTypeKey(e.target.value)}
            disabled={disabled}
            className={`${TRADE_WRITE_FB_CONTROL} disabled:opacity-60`}
            aria-invalid={!!errors.bodyType}
          >
            <option value="">{t("trade_075")}</option>
            {USED_CAR_BODY_TYPES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {labelForUsedCarBodyTypeKey(entry.key, t)}
              </option>
            ))}
          </select>
          {errors.bodyType ? (
            <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.bodyType}</p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label className={TRADE_WRITE_FB_FIELD_LABEL}>
            {t("used_car_year_max_label")} <span className="text-sam-danger">*</span>
          </label>
          <select
            value={carYear}
            onChange={(e) => setCarYear(e.target.value)}
            disabled={disabled}
            className={`${TRADE_WRITE_FB_CONTROL} disabled:opacity-60`}
            aria-invalid={!!errors.carYear}
          >
            {yearOpts.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {errors.carYear ? (
            <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.carYear}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2">
        <label className={TRADE_WRITE_FB_FIELD_LABEL}>
          {t("used_car_budget_max_label")} <span className="text-sam-danger">*</span>
        </label>
        <div
          className={`${TRADE_WRITE_FB_CONTROL_ROW} focus-within:ring-2 focus-within:ring-signature/20 ${disabled ? "opacity-60" : ""}`}
        >
          <span className="shrink-0 sam-text-body font-medium text-sam-muted">{currencyUnitLabel}</span>
          <input
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(formatPriceInput(e.target.value))}
            readOnly={disabled}
            placeholder=""
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-sam-fg outline-none placeholder:text-sam-meta"
            aria-invalid={!!errors.price}
          />
        </div>
        {errors.price ? (
          <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.price}</p>
        ) : null}
      </div>
      {allowPriceOffer ? (
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isPriceOfferEnabled}
            onChange={(e) => setIsPriceOfferEnabled(e.target.checked)}
            disabled={disabled}
            className="rounded border-sam-border"
          />
          <span className="sam-text-body-secondary text-sam-muted">{t("trade_005")}</span>
        </label>
      ) : null}
    </>
  );
}
