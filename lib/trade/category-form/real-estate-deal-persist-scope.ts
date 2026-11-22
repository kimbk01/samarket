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
