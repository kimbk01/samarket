"use client";

import {
  USED_CAR_BODY_TYPES,
  buildUsedCarYearSelectOptions,
} from "@/lib/trade/used-car-form-catalog";
import { formatPriceInput } from "@/lib/utils/format";
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
  const yearOpts = buildUsedCarYearSelectOptions();
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={TRADE_WRITE_FB_FIELD_LABEL}>
            차량 유형 <span className="text-sam-danger">*</span>
          </label>
          <select
            value={bodyTypeKey}
            onChange={(e) => setBodyTypeKey(e.target.value)}
            disabled={disabled}
            className={`${TRADE_WRITE_FB_CONTROL} disabled:opacity-60`}
            aria-invalid={!!errors.bodyType}
          >
            <option value="">선택</option>
            {USED_CAR_BODY_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.labelKo}
              </option>
            ))}
          </select>
          {errors.bodyType ? (
            <p className="mt-1 sam-text-body-secondary text-sam-danger">{errors.bodyType}</p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label className={TRADE_WRITE_FB_FIELD_LABEL}>
            년식 (이하) <span className="text-sam-danger">*</span>
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
          예산 (이하) <span className="text-sam-danger">*</span>
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
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-[#050505] outline-none placeholder:text-[#8a8d91]"
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
          <span className="sam-text-body-secondary text-sam-muted">가격 제안받기</span>
        </label>
      ) : null}
    </>
  );
}
