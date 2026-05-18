import type { MessageKey } from "@/lib/i18n/messages";
import type { UsedCarBodyTypeKey } from "@/lib/trade/used-car-form-catalog";

export const USED_CAR_BODY_TYPE_LABEL_KEYS: Record<UsedCarBodyTypeKey, MessageKey> = {
  sedan: "used_car_body_sedan",
  suv: "used_car_body_suv",
  rv: "used_car_body_rv",
  van: "used_car_body_van",
  truck: "used_car_body_truck",
  sports: "used_car_body_sports",
  kei: "used_car_body_kei",
  other: "used_car_body_other",
};

export const USED_CAR_MILEAGE_LABEL_KEYS: Record<string, MessageKey> = {
  "5000": "used_car_mileage_under_5k",
  "10000": "used_car_mileage_about_10k",
  "20000": "used_car_mileage_about_20k",
  "50000": "used_car_mileage_about_50k",
  "80000": "used_car_mileage_about_80k",
  "100000": "used_car_mileage_about_100k",
  "150000": "used_car_mileage_about_150k",
  "200000": "used_car_mileage_over_200k",
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function usedCarModelOptionLabel(t: TranslateFn, modelKey: string, label: string): string {
  if (modelKey === "other-model") return t("used_car_model_other");
  return label;
}

export function usedCarBrandOptionLabel(t: TranslateFn, brandKey: string, label: string): string {
  if (brandKey === "other") return t("used_car_brand_other");
  return label;
}
