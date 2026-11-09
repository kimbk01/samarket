/**
 * 앱 동네 ID(REGIONS regionId·cityId) → 시/군 LGU(PSGC) — 브라우저·서버 공통 (fs 없음).
 *
 * 대응표: `trade-lgu-city-rollup`(동네 → 시/군 slug, 143/143) + `TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL`(slug → PSGC).
 * M1 (2026-11-09): 주소의 LGU 와 다른 시/군의 동네 ID 는 쓰지 않는다 — 이 함수로 대조한다.
 */
import { resolveTradeLguCityFromInternal } from "@/lib/trade/location/trade-lgu-city-rollup";
import { TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL } from "@/lib/trade/location/national/legacy-product-alias-canonical";

export function appLocationIdsToCanonicalLguId(
  regionId: string | null | undefined,
  cityId: string | null | undefined,
): string | null {
  const slug = resolveTradeLguCityFromInternal(regionId, cityId)?.id;
  if (!slug) return null;
  const psgc = (TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL as Record<string, string>)[slug];
  return typeof psgc === "string" && psgc.trim() ? psgc.trim() : null;
}
