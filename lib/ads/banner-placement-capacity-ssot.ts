/**
 * Banner placement capacity / rotation / fallback SSOT — ADDENDUM LOCK §4–§5.
 * SLOT (capacity) ≠ SLIDE (carousel frame). No fake weighted/shuffle. No HOUSE_AD UI until writer exists.
 */

export const BANNER_PLACEMENT_CAPACITY_SSOT = {
  STORES_HOME_HERO: {
    min: 1,
    max: 5,
    /** Concurrent campaigns in carousel pool (not simultaneous frames). */
    defaultCapacity: 5,
    visibleAtOnce: 1,
    rotationMode: "ordered_carousel" as const,
    rotationIntervalMs: 5000,
    fallback: "COLLAPSE_SLOT" as const,
    houseAdUiAllowed: false,
  },
  STORES_HOME_INLINE_1: {
    min: 1,
    max: 3,
    defaultCapacity: 1,
    visibleAtOnce: 1,
    rotationMode: "single" as const,
    rotationIntervalMs: null,
    fallback: "COLLAPSE_SLOT" as const,
    houseAdUiAllowed: false,
  },
  STORES_CATEGORY_TOP: {
    min: 1,
    max: 3,
    defaultCapacity: 1,
    visibleAtOnce: 1,
    rotationMode: "single" as const,
    rotationIntervalMs: null,
    fallback: "ORGANIC_CONTENT" as const,
    houseAdUiAllowed: false,
  },
  STORES_SEARCH_TOP: {
    min: 1,
    max: 1,
    defaultCapacity: 1,
    visibleAtOnce: 1,
    rotationMode: "single" as const,
    rotationIntervalMs: null,
    fallback: "ORGANIC_CONTENT" as const,
    houseAdUiAllowed: false,
  },
  TRADE_HOME: {
    min: 1,
    max: 3,
    defaultCapacity: 3,
    visibleAtOnce: 1,
    rotationMode: "ordered_carousel" as const,
    rotationIntervalMs: 4000,
    fallback: "COLLAPSE_SLOT" as const,
    houseAdUiAllowed: false,
  },
  COMMUNITY_HOME: {
    min: 1,
    max: 3,
    defaultCapacity: 3,
    visibleAtOnce: 1,
    rotationMode: "ordered_carousel" as const,
    rotationIntervalMs: 4000,
    fallback: "COLLAPSE_SLOT" as const,
    houseAdUiAllowed: false,
  },
} as const;

export type BannerPlacementCapacityKey = keyof typeof BANNER_PLACEMENT_CAPACITY_SSOT;

export function bannerPlacementDefaultCapacity(key: string): number {
  const row = (BANNER_PLACEMENT_CAPACITY_SSOT as Record<string, { defaultCapacity: number }>)[
    key
  ];
  return row?.defaultCapacity ?? 1;
}

export function clampBannerPlacementCapacity(key: string, raw: number): number {
  const row = (BANNER_PLACEMENT_CAPACITY_SSOT as Record<
    string,
    { min: number; max: number; defaultCapacity: number }
  >)[key];
  if (!row) return Math.max(1, Math.trunc(raw) || 1);
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return row.defaultCapacity;
  return Math.max(row.min, Math.min(row.max, n));
}

/** DUPLICATE_POLICY — same advertiser + placement + schedule overlap */
export const BANNER_DUPLICATE_POLICY = {
  mode: "MULTIPLE_ALLOWED_WARN" as const,
  humanKo: "같은 기간에 동일 광고주의 배너가 겹칩니다.",
  humanEn: "This advertiser already has a banner overlapping this period on the same placement.",
} as const;

export const BANNER_CAPACITY_FULL_COPY = {
  humanKo: "해당 기간 만석",
  humanEn: "No open slots for this period",
} as const;

/** Unsupported rotation modes — never expose in Admin UI */
export const BANNER_ROTATION_UNSUPPORTED = ["weighted", "shuffle"] as const;
