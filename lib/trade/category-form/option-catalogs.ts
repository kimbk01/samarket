/**
 * Product option catalogs referenced by Field Library optionCatalogId.
 * Values match existing posts.meta / form-options storage tokens.
 */
import {
  USED_CAR_BODY_TYPES,
  USED_CAR_BRANDS,
  USED_CAR_BRAND_OTHER_KEY,
  USED_CAR_MILEAGE_PRESETS,
} from "@/lib/trade/used-car-form-catalog";

export type TradeOptionEntry = { value: string; labelKo: string; labelEn: string };

const USED_CAR_BODY_TYPE_LABELS: Record<string, { labelKo: string; labelEn: string }> = {
  sedan: { labelKo: "승용차", labelEn: "Sedan" },
  suv: { labelKo: "SUV", labelEn: "SUV" },
  rv: { labelKo: "RV·승합", labelEn: "RV / van" },
  van: { labelKo: "밴", labelEn: "Van" },
  truck: { labelKo: "트럭", labelEn: "Truck" },
  sports: { labelKo: "스포츠카", labelEn: "Sports car" },
  kei: { labelKo: "경차", labelEn: "Kei car" },
  other: { labelKo: "기타", labelEn: "Other" },
};

const USED_CAR_MILEAGE_PRESET_LABELS: Record<string, { labelKo: string; labelEn: string }> = {
  "5000": { labelKo: "5,000 km 미만", labelEn: "Under 5,000 km" },
  "10000": { labelKo: "약 1만 km", labelEn: "About 10,000 km" },
  "20000": { labelKo: "약 2만 km", labelEn: "About 20,000 km" },
  "50000": { labelKo: "약 5만 km", labelEn: "About 50,000 km" },
  "80000": { labelKo: "약 8만 km", labelEn: "About 80,000 km" },
  "100000": { labelKo: "약 10만 km", labelEn: "About 100,000 km" },
  "150000": { labelKo: "약 15만 km", labelEn: "About 150,000 km" },
  "200000": { labelKo: "20만 km 이상", labelEn: "200,000 km or more" },
};

function buildUsedCarBrandCatalog(): TradeOptionEntry[] {
  return USED_CAR_BRANDS.map((b) => ({
    value: b.key,
    labelKo: b.key === USED_CAR_BRAND_OTHER_KEY ? "기타" : b.label,
    labelEn: b.key === USED_CAR_BRAND_OTHER_KEY ? "Other" : b.label,
  }));
}

function buildUsedCarModelCatalog(): TradeOptionEntry[] {
  const seen = new Set<string>();
  const out: TradeOptionEntry[] = [];
  for (const brand of USED_CAR_BRANDS) {
    for (const model of brand.models) {
      if (seen.has(model.key)) continue;
      seen.add(model.key);
      const isOther = model.label === "__other_model__";
      out.push({
        value: model.key,
        labelKo: isOther ? "기타 모델" : model.label,
        labelEn: isOther ? "Other model" : model.label,
      });
    }
  }
  return out;
}

function buildUsedCarBodyTypeCatalog(): TradeOptionEntry[] {
  return USED_CAR_BODY_TYPES.map((entry) => {
    const labels = USED_CAR_BODY_TYPE_LABELS[entry.key] ?? {
      labelKo: entry.key,
      labelEn: entry.key,
    };
    return { value: entry.key, ...labels };
  });
}

function buildUsedCarMileagePresetCatalog(): TradeOptionEntry[] {
  return USED_CAR_MILEAGE_PRESETS.map((preset) => {
    const labels = USED_CAR_MILEAGE_PRESET_LABELS[preset.key] ?? {
      labelKo: `${preset.digits} km`,
      labelEn: `${preset.digits} km`,
    };
    return { value: preset.digits, ...labels };
  });
}

export const TRADE_OPTION_CATALOGS: Record<string, readonly TradeOptionEntry[]> = {
  used_car_brands: buildUsedCarBrandCatalog(),
  used_car_models: buildUsedCarModelCatalog(),
  used_car_body_types: buildUsedCarBodyTypeCatalog(),
  used_car_mileage_presets: buildUsedCarMileagePresetCatalog(),
  vehicle_transmission: [
    { value: "automatic", labelKo: "자동", labelEn: "Automatic" },
    { value: "manual", labelKo: "수동", labelEn: "Manual" },
    { value: "cvt", labelKo: "CVT", labelEn: "CVT" },
  ],
  vehicle_fuel_type: [
    { value: "gasoline", labelKo: "가솔린", labelEn: "Gasoline" },
    { value: "diesel", labelKo: "디젤", labelEn: "Diesel" },
    { value: "hybrid", labelKo: "하이브리드", labelEn: "Hybrid" },
    { value: "electric", labelKo: "전기", labelEn: "Electric" },
    { value: "lpg", labelKo: "LPG", labelEn: "LPG" },
  ],
  /** Storage keeps ko literals (legacy) */
  real_estate_deal_type: [
    { value: "임대", labelKo: "임대", labelEn: "Rent" },
    { value: "판매", labelKo: "판매", labelEn: "Sale" },
  ],
  real_estate_estate_type: [
    { value: "상가", labelKo: "상가", labelEn: "Commercial" },
    { value: "주택", labelKo: "주택", labelEn: "House" },
    { value: "콘도", labelKo: "콘도", labelEn: "Condo" },
    { value: "주차장", labelKo: "주차장", labelEn: "Parking" },
  ],
  real_estate_move_in: [
    { value: "협의 가능", labelKo: "협의 가능", labelEn: "Negotiable" },
    { value: "즉시입주", labelKo: "즉시입주", labelEn: "Immediate" },
  ],
  used_car_trade: [
    { value: "sell", labelKo: "팝니다", labelEn: "For sale" },
    { value: "buy", labelKo: "삽니다", labelEn: "Wanted" },
  ],
  /** Hire-side listing + work category (seek uses separate shell catalogs) */
  jobs_listing_kind: [
    { value: "hire", labelKo: "구인", labelEn: "Hiring" },
    { value: "work", labelKo: "구직", labelEn: "Looking for work" },
  ],
  jobs_work_category: [
    { value: "매장관리/판매", labelKo: "매장관리/판매", labelEn: "Retail" },
    { value: "주방보조/설거지", labelKo: "주방보조/설거지", labelEn: "Kitchen help" },
    { value: "주방장/조리사", labelKo: "주방장/조리사", labelEn: "Cook" },
    { value: "서빙", labelKo: "서빙", labelEn: "Serving" },
    { value: "배달", labelKo: "배달", labelEn: "Delivery" },
    { value: "사무보조", labelKo: "사무보조", labelEn: "Office" },
    { value: "청소", labelKo: "청소", labelEn: "Cleaning" },
    { value: "재고/물류", labelKo: "재고/물류", labelEn: "Logistics" },
    { value: "이사/짐", labelKo: "이사/짐", labelEn: "Moving" },
    { value: "돌봄", labelKo: "돌봄", labelEn: "Care" },
    { value: "기타", labelKo: "기타", labelEn: "Other" },
  ],
  jobs_work_term: [
    { value: "short", labelKo: "단기", labelEn: "Short-term" },
    { value: "long", labelKo: "장기", labelEn: "Long-term" },
    { value: "one_day", labelKo: "하루", labelEn: "One day" },
  ],
  jobs_pay_type: [
    { value: "hourly", labelKo: "시급", labelEn: "Hourly" },
    { value: "daily", labelKo: "일급", labelEn: "Daily" },
    { value: "monthly", labelKo: "월급", labelEn: "Monthly" },
    { value: "per_task", labelKo: "건당", labelEn: "Per task" },
  ],
  jobs_experience_level: [
    { value: "none", labelKo: "경력 없음", labelEn: "None" },
    { value: "beginner", labelKo: "초보 가능", labelEn: "Beginner OK" },
    { value: "1y", labelKo: "1년+", labelEn: "1y+" },
    { value: "3y_plus", labelKo: "3년+", labelEn: "3y+" },
  ],
  exchange_direction: [
    { value: "sell", labelKo: "페소 팝니다", labelEn: "Sell PHP" },
    { value: "buy", labelKo: "페소 삽니다", labelEn: "Buy PHP" },
  ],
  exchange_prep: [
    { value: "id", labelKo: "신분증", labelEn: "ID" },
    { value: "bankbook", labelKo: "본인 명의 통장", labelEn: "Bankbook" },
    { value: "identity_not_required", labelKo: "본인 확인 불필요", labelEn: "ID not required" },
  ],
};

export function getTradeOptionCatalog(id: string | undefined): readonly TradeOptionEntry[] {
  if (!id) return [];
  return TRADE_OPTION_CATALOGS[id] ?? [];
}

export function labelForTradeOption(
  catalogId: string,
  value: string,
  lang: "ko" | "en"
): string {
  const hit = getTradeOptionCatalog(catalogId).find((o) => o.value === value);
  if (!hit) return value;
  return lang === "en" ? hit.labelEn : hit.labelKo;
}
