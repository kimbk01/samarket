/**
 * Product option catalogs referenced by Field Library optionCatalogId.
 */
export type TradeOptionEntry = { value: string; labelKo: string; labelEn: string };

export const TRADE_OPTION_CATALOGS: Record<string, readonly TradeOptionEntry[]> = {
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
