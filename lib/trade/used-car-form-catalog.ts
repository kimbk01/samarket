/**
 * 중고차 폼 정적 카탈로그.
 * - 팝니다: 브랜드·모델·연식·주행거리 — 저장은 meta.car_model 단일 문자열(브랜드 라벨 + 공백 + 모델 라벨).
 * - 삽니다: 차량 유형 — meta.car_body_type(키 문자열, 예: sedan).
 */

export const USED_CAR_FORM_YEAR_MIN = 1990;

export function getUsedCarFormYearMax(): number {
  return new Date().getFullYear();
}

export function buildUsedCarYearSelectOptions(): { value: string; label: string }[] {
  const max = getUsedCarFormYearMax();
  const out: { value: string; label: string }[] = [{ value: "", label: "선택" }];
  for (let y = max; y >= USED_CAR_FORM_YEAR_MIN; y--) {
    out.push({ value: String(y), label: `${y}년` });
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

export type UsedCarBodyTypeEntry = { key: UsedCarBodyTypeKey; labelKo: string };

export const USED_CAR_BODY_TYPES: UsedCarBodyTypeEntry[] = [
  { key: "sedan", labelKo: "승용차" },
  { key: "suv", labelKo: "SUV" },
  { key: "rv", labelKo: "RV·승합" },
  { key: "van", labelKo: "밴" },
  { key: "truck", labelKo: "트럭" },
  { key: "sports", labelKo: "스포츠카" },
  { key: "kei", labelKo: "경차" },
  { key: "other", labelKo: "기타" },
];

export function labelForUsedCarBodyTypeKey(key: string): string {
  const k = key.trim();
  const hit = USED_CAR_BODY_TYPES.find((x) => x.key === k);
  return hit?.labelKo ?? k;
}

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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
    ],
  },
  {
    key: "isuzu",
    label: "Isuzu",
    models: [
      { key: "d-max", label: "D-Max" },
      { key: "mux", label: "mu-X" },
      { key: "travis", label: "Traviz" },
      { key: "other-model", label: "기타 모델" },
    ],
  },
  {
    key: "chevrolet",
    label: "Chevrolet",
    models: [
      { key: "spark", label: "Spark" },
      { key: "trailblazer", label: "Trailblazer" },
      { key: "colorado", label: "Colorado" },
      { key: "other-model", label: "기타 모델" },
    ],
  },
  {
    key: "subaru",
    label: "Subaru",
    models: [
      { key: "xv", label: "XV" },
      { key: "forester", label: "Forester" },
      { key: "outback", label: "Outback" },
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
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
      { key: "other-model", label: "기타 모델" },
    ],
  },
  {
    key: "other",
    label: "기타",
    models: [{ key: USED_CAR_MODEL_FREE_KEY, label: "차종 직접 입력" }],
  },
];

export function findUsedCarBrand(key: string): UsedCarCatalogBrand | undefined {
  return USED_CAR_BRANDS.find((b) => b.key === key);
}

/** 카탈로그 선택 → car_model 저장 문자열 */
export function buildCarModelLineFromKeys(brandKey: string, modelKey: string): string | null {
  const b = findUsedCarBrand(brandKey);
  if (!b || b.key === USED_CAR_BRAND_OTHER_KEY) return null;
  const m = b.models.find((x) => x.key === modelKey);
  if (!m) return null;
  return `${b.label} ${m.label}`.trim();
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
      const line = `${b.label} ${m.label}`;
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
  label: string;
  /** 저장용 km (숫자만) */
  digits: string;
};

export const USED_CAR_MILEAGE_PRESETS: UsedCarMileagePreset[] = [
  { key: "5000", label: "5,000 km 미만", digits: "5000" },
  { key: "10000", label: "약 1만 km", digits: "10000" },
  { key: "20000", label: "약 2만 km", digits: "20000" },
  { key: "50000", label: "약 5만 km", digits: "50000" },
  { key: "80000", label: "약 8만 km", digits: "80000" },
  { key: "100000", label: "약 10만 km", digits: "100000" },
  { key: "150000", label: "약 15만 km", digits: "150000" },
  { key: "200000", label: "20만 km 이상", digits: "200000" },
];

export function findMileagePresetKeyForDigits(digitsRaw: string): string {
  const d = digitsRaw.replace(/,/g, "").replace(/\D/g, "");
  if (!d) return "";
  for (const p of USED_CAR_MILEAGE_PRESETS) {
    if (p.digits === d) return p.key;
  }
  return USED_CAR_MILEAGE_CUSTOM_KEY;
}
