/**
 * 거래 목록 계약 ⑤ 거리 — 순서만 정하는 지역 구간 (`docs/dibay-marketplace-list-ssot-target.md` §2·§3).
 *
 * - 기준 위치 없음(전국): 한 구간
 * - 거리 「전체」: (내 동네) → 기준 시 → 주변(64km) → 그 외
 * - 거리 숫자: 반경 안 → 주변(64km, 반경보다 클 때) → 그 외
 * 모든 구간은 겹치지 않는 SQL 조건이고 합은 전체다.
 */
import {
  BROWSE_LOCATION_TIER_ORDER,
  classifyListingBrowseTier,
  resolveBrowseLocationTiersSoft,
  tierLocationQueryExtras,
  type BrowseLocationTier,
  type BrowseLocationTiers,
} from "@/lib/trade/location/national/browse-location-tiers";
import {
  listingMatchesTradeFeedLocation,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

/** 회원 대표 주소의 앱 지역 동네 id (게시물 `region`·`city` 와 같은 체계) */
export type ListHoodAnchor = { regionId: string; cityId: string };

export type ListLocationSectionPart = "city" | "nearby" | "outside" | null;

export type ListLocationBlock = {
  /** 안내 줄 키 조각 — 첫 구간은 null */
  part: ListLocationSectionPart;
  loc: TradeFeedQueryExtras["tradeFeedLocation"] | undefined;
  applyLocation: boolean;
  /** 추가 `.or()` 그룹(각각 AND) — 내 동네 / 내 시(동네 제외) 구분 */
  extraOrGroups: string[];
};

export type ListLocationPlan = {
  blocks: ListLocationBlock[];
  anchorCanonicalId: string | null;
  /** 내 동네 구간 — 기준 시 구간(`fromIndex`) 안에서 동네가 같은 글은 `toIndex` */
  hood: { regionId: string; cityId: string; fromIndex: number; toIndex: number } | null;
  /** 메모리 분류(검색 후보 배치용) — `blocks` 인덱스 */
  blockOf: (row: { trade_lgu_id?: string | null; region?: string | null; city?: string | null }) => number;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidListHoodAnchor(h: ListHoodAnchor | null | undefined): h is ListHoodAnchor {
  return Boolean(h && SAFE_ID.test(h.regionId) && SAFE_ID.test(h.cityId));
}

function hoodAndBody(h: ListHoodAnchor): string {
  return `and(region.eq.${h.regionId},city.eq.${h.cityId})`;
}

function hoodComplementBody(h: ListHoodAnchor): string {
  return `region.is.null,city.is.null,region.neq.${h.regionId},city.neq.${h.cityId}`;
}

function rowInHood(row: { region?: string | null; city?: string | null }, h: ListHoodAnchor): boolean {
  return (row.region ?? "") === h.regionId && (row.city ?? "") === h.cityId;
}

/**
 * 내 동네는 기준 시 구간 안에서만 의미가 있다 — 동네 id 가 기준 시의 예전 지역 구성원이 아니면 쓰지 않는다.
 */
export function hoodBelongsToTiers(h: ListHoodAnchor, tiers: BrowseLocationTiers): boolean {
  return listingMatchesTradeFeedLocation(
    { trade_lgu_id: null, region: h.regionId, city: h.cityId },
    tiers.local
  );
}

export function resolveListLocationPlan(
  constraint: TradeFeedLocationConstraint,
  hood: ListHoodAnchor | null
): ListLocationPlan {
  if (constraint.kind !== "lgu") {
    return {
      blocks: [{ part: null, loc: undefined, applyLocation: false, extraOrGroups: [] }],
      anchorCanonicalId: null,
      hood: null,
      blockOf: () => 0,
    };
  }
  const tiers = resolveBrowseLocationTiersSoft(constraint);
  if (!tiers) {
    return {
      blocks: [{ part: null, loc: undefined, applyLocation: false, extraOrGroups: [] }],
      anchorCanonicalId: constraint.canonicalId,
      hood: null,
      blockOf: () => 0,
    };
  }
  const useHood =
    constraint.radiusKm == null && isValidListHoodAnchor(hood) && hoodBelongsToTiers(hood, tiers);

  const blocks: ListLocationBlock[] = [];
  const tierIndex: Partial<Record<BrowseLocationTier, number>> = {};
  let hoodIndex = -1;
  for (const tier of BROWSE_LOCATION_TIER_ORDER) {
    const loc = tierLocationQueryExtras(tiers, tier);
    if (!loc) continue;
    if (tier === "local" && useHood) {
      hoodIndex = blocks.length;
      blocks.push({ part: null, loc, applyLocation: true, extraOrGroups: [hoodAndBody(hood!)] });
      tierIndex.local = blocks.length;
      blocks.push({ part: "city", loc, applyLocation: true, extraOrGroups: [hoodComplementBody(hood!)] });
      continue;
    }
    tierIndex[tier] = blocks.length;
    blocks.push({
      part: blocks.length === 0 ? null : tier === "local" ? "city" : tier === "nearby" ? "nearby" : "outside",
      loc,
      applyLocation: true,
      extraOrGroups: [],
    });
  }
  return {
    blocks,
    anchorCanonicalId: tiers.anchorCanonicalId,
    hood:
      hoodIndex >= 0 && tierIndex.local != null
        ? { regionId: hood!.regionId, cityId: hood!.cityId, fromIndex: tierIndex.local, toIndex: hoodIndex }
        : null,
    blockOf: (row) => {
      const tier = classifyListingBrowseTier(row, tiers);
      if (tier === "local" && hoodIndex >= 0 && rowInHood(row, hood!)) return hoodIndex;
      return tierIndex[tier] ?? blocks.length - 1;
    },
  };
}
