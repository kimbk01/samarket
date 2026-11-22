/**
 * 부동산 거래 유형별 저장 범위 (감사 R1·R2, 2026-11-22).
 *
 * 화면 표시 규칙(`behavior-adapters.ts` `adaptRealEstate`)과 같은 기준이다.
 * - 판매: 매매가(`posts.price`)만 저장한다. 보증금·월세·관리비·권리금은 저장하지 않는다.
 * - 임대: 보증금·월세·관리비·권리금만 저장한다. 매매가는 저장하지 않는다.
 * - 유형을 고르지 않은 예전 글: 지금까지처럼 둘 다 저장한다.
 *
 * 저장값은 카탈로그(`option-catalogs.ts` real_estate_deal_type)의 value 를 그대로 쓴다.
 */
import { getTradeOptionCatalog } from "./option-catalogs";

export type RealEstateDealPersistScope = {
  /** 보증금·월세·관리비·권리금 */
  rentFields: boolean;
  /** 매매가(`posts.price`) */
  salePrice: boolean;
};

function dealValueByEnglishLabel(labelEn: string): string {
  return getTradeOptionCatalog("real_estate_deal_type").find((o) => o.labelEn === labelEn)?.value ?? "";
}

export const REAL_ESTATE_DEAL_SALE_VALUE = dealValueByEnglishLabel("Sale");
export const REAL_ESTATE_DEAL_RENT_VALUE = dealValueByEnglishLabel("Rent");

export function realEstateDealPersistScope(dealType: string | null | undefined): RealEstateDealPersistScope {
  const deal = String(dealType ?? "").trim();
  return {
    rentFields: !deal || deal !== REAL_ESTATE_DEAL_SALE_VALUE,
    salePrice: !deal || deal !== REAL_ESTATE_DEAL_RENT_VALUE,
  };
}

/** 목록 가격 조건이 볼 칸 — `trade_list_page` 의 `price_field` 인자 (감사 R4, 2026-11-22) */
export type TradeListPriceField = "price" | "meta_monthly";

/**
 * 감사 R4 (Owner 2026-11-22 · 설계 안 A): 부동산 「임대」를 고른 목록에서는 가격 조건 = 월세.
 * 판단 근거는 서버가 만든 구성 조건(`deal_type` eq 임대)뿐이다 — 화면 값은 쓰지 않는다.
 */
export function resolveTradeListPriceField(
  clauses: readonly { fieldId: string; op: string; values: readonly string[] }[] | null | undefined
): TradeListPriceField {
  const rent = (clauses ?? []).some(
    (c) =>
      c.fieldId === "deal_type" &&
      c.op === "eq" &&
      c.values.length > 0 &&
      c.values.every((v) => v === REAL_ESTATE_DEAL_RENT_VALUE)
  );
  return rent ? "meta_monthly" : "price";
}

/**
 * 감사 R4 필터 화면: 부동산은 거래 유형을 먼저 골라야 가격 칸이 뜻을 가진다.
 * - `price`: 부동산이 아님(지금처럼 가격)
 * - `sale`: 부동산 판매 — 매매가
 * - `monthly`: 부동산 임대 — 월세
 * - `hidden`: 부동산인데 거래 유형을 고르지 않음 — 가격 칸을 숨기고 안내
 */
export type TradeFilterPriceMode = "price" | "sale" | "monthly" | "hidden";

export function resolveTradeFilterPriceMode(
  profileId: string | null | undefined,
  dealTypeSelection: string | null | undefined
): TradeFilterPriceMode {
  if (profileId !== "real-estate") return "price";
  const deal = String(dealTypeSelection ?? "").trim();
  if (deal === REAL_ESTATE_DEAL_SALE_VALUE) return "sale";
  if (deal === REAL_ESTATE_DEAL_RENT_VALUE) return "monthly";
  return "hidden";
}
