/**
 * 중고차 폼 정적 카탈로그.
 * - 팝니다: 브랜드·모델·연식·주행거리 — 저장은 meta.car_model 단일 문자열(브랜드 라벨 + 공백 + 모델 라벨).
 * - 삽니다: 차량 유형 — meta.car_body_type(키 문자열, 예: sedan).
 */

import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import {
  USED_CAR_BODY_TYPE_LABEL_KEYS,
  USED_CAR_MILEAGE_LABEL_KEYS,
  usedCarBrandOptionLabel,
  usedCarModelOptionLabel,
} from "@/lib/trade/used-car-label-keys";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

function defaultT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

export const USED_CAR_FORM_YEAR_MIN = 1990;

export function getUsedCarFormYearMax(): number {
  return new Date().getFullYear();
}

export function buildUsedCarYearSelectOptions(
  t: TranslateFn = defaultT
): { value: string; label: string }[] {
  const max = getUsedCarFormYearMax();
  const out: { value: string; label: string }[] = [{ value: "", label: t("used_car_select_placeholder") }];
  for (let y = max; y >= USED_CAR_FORM_YEAR_MIN; y--) {
    out.push({ value: String(y), label: t("used_car_year_suffix", { year: y }) });
  }
  return out;
}

export type UsedCarBodyTypeKey =
  | "sedan"
  | "suv"
  | "rv"
  | "van"
  | "truck"
  | "sports"
  | "kei"
  | "other";

export type UsedCarBodyTypeEntry = { key: UsedCarBodyTypeKey };

export const USED_CAR_BODY_TYPES: UsedCarBodyTypeEntry[] = [
  { key: "sedan" },
  { key: "suv" },
  { key: "rv" },
  { key: "van" },
  { key: "truck" },
  { key: "sports" },
  { key: "kei" },
  { key: "other" },
];

export function labelForUsedCarBodyTypeKey(key: string, t: TranslateFn = defaultT): string {
  const k = key.trim() as UsedCarBodyTypeKey;
  const labelKey = USED_CAR_BODY_TYPE_LABEL_KEYS[k];
  return labelKey ? t(labelKey) : key.trim();
}

export function labelForUsedCarMileagePresetKey(key: string, t: TranslateFn = defaultT): string {
  const labelKey = USED_CAR_MILEAGE_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : key;
}

export { usedCarBrandOptionLabel, usedCarModelOptionLabel };

export const USED_CAR_BRAND_OTHER_KEY = "other";
export const USED_CAR_MODEL_FREE_KEY = "free";

export type UsedCarCatalogModel = { key: string; label: string };

export type UsedCarCatalogBrand = {
  key: string;
  label: string;
  models: UsedCarCatalogModel[];
};

/** 필리핀·동남아에서 흔한 브랜드 위주 (추가 용이) */
export const USED_CAR_BRANDS: UsedCarCatalogBrand[] = [
  {
    key: "toyota",
    label: "Toyota",
    models: [
      { key: "vios", label: "Vios" },
      { key: "wigo", label: "Wigo" },
      { key: "avanza", label: "Avanza" },
      { key: "innova", label: "Innova" },
      { key: "fortuner", label: "Fortuner" },
      { key: "hilux", label: "Hilux" },
      { key: "rush", label: "Rush" },
      { key: "raize", label: "Raize" },
      { key: "corolla-altis", label: "Corolla Altis" },
      { key: "camry", label: "Camry" },
      { key: "alphard", label: "Alphard" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "mitsubishi",
    label: "Mitsubishi",
    models: [
      { key: "mirage", label: "Mirage" },
      { key: "xpander", label: "Xpander" },
      { key: "montero-sport", label: "Montero Sport" },
      { key: "strada", label: "Strada" },
      { key: "l300", label: "L300" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "honda",
    label: "Honda",
    models: [
      { key: "brio", label: "Brio" },
      { key: "city", label: "City" },
      { key: "civic", label: "Civic" },
      { key: "accord", label: "Accord" },
      { key: "br-v", label: "BR-V" },
      { key: "cr-v", label: "CR-V" },
      { key: "hr-v", label: "HR-V" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "hyundai",
    label: "Hyundai",
    models: [
      { key: "eon", label: "Eon" },
      { key: "reina", label: "Reina" },
      { key: "accent", label: "Accent" },
      { key: "elantra", label: "Elantra" },
      { key: "tucson", label: "Tucson" },
      { key: "staria", label: "Staria" },
      { key: "creta", label: "Creta" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "nissan",
    label: "Nissan",
    models: [
      { key: "almera", label: "Almera" },
      { key: "navara", label: "Navara" },
      { key: "terra", label: "Terra" },
      { key: "livina", label: "Livina" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "ford",
    label: "Ford",
    models: [
      { key: "ecosport", label: "EcoSport" },
      { key: "territory", label: "Territory" },
      { key: "ranger", label: "Ranger" },
      { key: "everest", label: "Everest" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "mazda",
    label: "Mazda",
    models: [
      { key: "mazda2", label: "Mazda2" },
      { key: "mazda3", label: "Mazda3" },
      { key: "cx3", label: "CX-3" },
      { key: "cx5", label: "CX-5" },
      { key: "cx9", label: "CX-9" },
      { key: "bt50", label: "BT-50" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "kia",
    label: "Kia",
    models: [
      { key: "picanto", label: "Picanto" },
      { key: "rio", label: "Rio" },
      { key: "soluto", label: "Soluto" },
      { key: "sportage", label: "Sportage" },
      { key: "seltos", label: "Seltos" },
      { key: "carnival", label: "Carnival" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "suzuki",
    label: "Suzuki",
    models: [
      { key: "celerio", label: "Celerio" },
      { key: "swift", label: "Swift" },
      { key: "dzire", label: "Dzire" },
      { key: "ertiga", label: "Ertiga" },
      { key: "jimny", label: "Jimny" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "isuzu",
    label: "Isuzu",
    models: [
      { key: "d-max", label: "D-Max" },
      { key: "mux", label: "mu-X" },
      { key: "travis", label: "Traviz" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "chevrolet",
    label: "Chevrolet",
    models: [
      { key: "spark", label: "Spark" },
      { key: "trailblazer", label: "Trailblazer" },
      { key: "colorado", label: "Colorado" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "subaru",
    label: "Subaru",
    models: [
      { key: "xv", label: "XV" },
      { key: "forester", label: "Forester" },
      { key: "outback", label: "Outback" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "bmw",
    label: "BMW",
    models: [
      { key: "series3", label: "3 Series" },
      { key: "series5", label: "5 Series" },
      { key: "x1", label: "X1" },
      { key: "x3", label: "X3" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "mercedes",
    label: "Mercedes-Benz",
    models: [
      { key: "a-class", label: "A-Class" },
      { key: "c-class", label: "C-Class" },
      { key: "e-class", label: "E-Class" },
      { key: "glc", label: "GLC" },
      { key: "other-model", label: "__other_model__" },
    ],
  },
  {
    key: "other",
    label: "__brand_other__",
    models: [{ key: USED_CAR_MODEL_FREE_KEY, label: "__model_free__" }],
  },
];

export function findUsedCarBrand(key: string): UsedCarCatalogBrand | undefined {
  return USED_CAR_BRANDS.find((b) => b.key === key);
}

function modelLineLabelForStorage(m: UsedCarCatalogModel): string {
  if (m.key === "other-model") return defaultT("used_car_model_other");
  return m.label;
}

/** 카탈로그 선택 → car_model 저장 문자열 */
export function buildCarModelLineFromKeys(brandKey: string, modelKey: string): string | null {
  const b = findUsedCarBrand(brandKey);
  if (!b || b.key === USED_CAR_BRAND_OTHER_KEY) return null;
  const m = b.models.find((x) => x.key === modelKey);
  if (!m) return null;
  return `${b.label} ${modelLineLabelForStorage(m)}`.trim();
}

/** 저장된 car_model → 폼 선택값 (신규·초안·수정 복원) */
export function resolveUsedCarSellKeysFromStoredCarModel(stored: string): {
  brandKey: string;
  modelKey: string;
  otherLine: string;
} {
  const t = stored.trim();
  if (!t) return { brandKey: "", modelKey: "", otherLine: "" };

  const catalogBrands = USED_CAR_BRANDS.filter((b) => b.key !== USED_CAR_BRAND_OTHER_KEY);
  const byLongestLabel = [...catalogBrands].sort((a, b) => b.label.length - a.label.length);

  for (const b of byLongestLabel) {
    for (const m of b.models) {
      const line = `${b.label} ${modelLineLabelForStorage(m)}`;
      if (t === line) {
        return { brandKey: b.key, modelKey: m.key, otherLine: "" };
      }
    }
  }

  return { brandKey: USED_CAR_BRAND_OTHER_KEY, modelKey: USED_CAR_MODEL_FREE_KEY, otherLine: t };
}

/** 주행거리: 프리셋 값은 meta.mileage 에 들어가는 숫자 문자열 */
export const USED_CAR_MILEAGE_CUSTOM_KEY = "custom";

export type UsedCarMileagePreset = {
  key: string;
  /** 저장용 km (숫자만) */
  digits: string;
};

export const USED_CAR_MILEAGE_PRESETS: UsedCarMileagePreset[] = [
  { key: "5000", digits: "5000" },
  { key: "10000", digits: "10000" },
  { key: "20000", digits: "20000" },
  { key: "50000", digits: "50000" },
  { key: "80000", digits: "80000" },
  { key: "100000", digits: "100000" },
  { key: "150000", digits: "150000" },
  { key: "200000", digits: "200000" },
];

export function findMileagePresetKeyForDigits(digitsRaw: string): string {
  const d = digitsRaw.replace(/,/g, "").replace(/\D/g, "");
  if (!d) return "";
  for (const p of USED_CAR_MILEAGE_PRESETS) {
    if (p.digits === d) return p.key;
  }
  return USED_CAR_MILEAGE_CUSTOM_KEY;
}
