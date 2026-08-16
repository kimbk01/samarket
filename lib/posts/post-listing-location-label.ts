import { getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";
import { resolveCanonicalToLegacyProductAlias } from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { getTradeNationalLguDisplayNameById } from "@/lib/trade/location/national/lgu-display-by-id";
import {
  getTradeLguCityDef,
  resolveTradeLguCityFromInternal,
} from "@/lib/trade/location/trade-lgu-city-rollup";

/**
 * PH 스타일 구역 줄(`joinAreaLine`) — 쉼표로 이어진 마지막 토큰을 **시·상위 행정**으로 본다.
 * 예: `Payatas, Quezon City` → `Quezon City`
 *
 * Meet-spot detail shortening only — NOT trade card public City authority.
 */
function cityTokenFromPhAreaLine(areaLine: string): string | null {
  const t = areaLine.trim();
  if (!t) return null;
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

/**
 * 거래 희망 장소 `display_line`을 상세/만남 UI용으로 축약.
 * **거래 카드 PUBLIC City에는 사용하지 않는다.**
 */
export function formatTradeMeetSpotLineForList(displayLine: string): string | null {
  const raw = displayLine.trim();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const lastLine = lines[lines.length - 1];
  const city = cityTokenFromPhAreaLine(lastLine);
  if (!city) return null;

  if (lines.length >= 3) {
    const establishment = lines[0];
    return establishment ? `${establishment} · ${city}` : city;
  }

  if (lines.length === 2) {
    const first = lines[0];
    const streetLike = /^\d/.test(first);
    if (streetLike) return city;
    return first ? `${first} · ${city}` : city;
  }

  return city;
}

/** 물품 글 `posts.region`·`posts.city`(앱 지역 ID) → 목록·상세와 동일 한 줄 라벨 (local Area) */
export function formatPostListingLocationLine(
  region: string | null | undefined,
  city: string | null | undefined
): string | null {
  const r = (region ?? "").trim();
  const c = (city ?? "").trim();
  if (!r && !c) return null;
  if (r && c) {
    const v = getLocationLabelIfValid(r, c);
    if (v) return v;
    const loose = getLocationLabel(r, c).trim();
    if (loose) return loose;
  }
  if (r) {
    const one = getLocationLabel(r, c).trim();
    return one || r;
  }
  return null;
}

/**
 * TRADE CARD / LIST PUBLIC CITY SSOT
 *
 * 1. posts.trade_lgu_id → City/Municipality displayName
 * 2. region/city → trade-lgu-city-rollup Product City
 * 3. safe local Area line only if rollup impossible
 * NEVER meta.trade_meet_spot (listing City ≠ meet spot)
 */
export function resolveTradeListingPublicCityLabel(input: {
  tradeLguId?: string | null;
  region?: string | null;
  city?: string | null;
}): string | null {
  const tid = (input.tradeLguId ?? "").trim();
  if (tid) {
    const legacyAlias = resolveCanonicalToLegacyProductAlias(tid);
    if (legacyAlias) {
      const def = getTradeLguCityDef(legacyAlias);
      if (def?.displayName?.trim()) return def.displayName.trim();
    }
    const national = getTradeNationalLguDisplayNameById(tid);
    if (national) return national;
  }

  const rollup = resolveTradeLguCityFromInternal(input.region, input.city);
  if (rollup?.displayName?.trim()) return rollup.displayName.trim();

  return formatPostListingLocationLine(input.region, input.city);
}

/**
 * @deprecated Prefer resolveTradeListingPublicCityLabel — meet_spot is ignored.
 * Kept for call-site compatibility; 4th arg is trade_lgu_id.
 */
export function resolveTradePostListingLocationLine(
  _meta: Record<string, unknown> | null | undefined,
  region: string | null | undefined,
  city: string | null | undefined,
  tradeLguId?: string | null
): string | null {
  return resolveTradeListingPublicCityLabel({ tradeLguId, region, city });
}
