/**
 * CUT2 — Deterministic rank-band exposure rotation (stateless, no DB).
 * Applies AFTER CUT1 recommended rank, BEFORE pagination/slice.
 */

export const STORE_DISCOVERY_EXPOSURE_BAND_SIZE = 4;

/** 1 hour — same slice returns identical exposure order */
export const STORE_DISCOVERY_EXPOSURE_WINDOW_MS = 3_600_000;

export type StoreDiscoveryExposureRow = { id: string };

export type StoreDiscoveryExposureInput<T extends StoreDiscoveryExposureRow> = {
  /** CUT1 recommended-sorted rows */
  recommendedSorted: T[];
  eligibilityRankById: Map<string, number>;
  /** Discovery scope — must NOT include page/limit/request id */
  exposureScope: string;
  nowMs?: number;
  bandSize?: number;
  windowMs?: number;
};

/**
 * djb2 — deterministic, no crypto/random dependency.
 */
export function deterministicExposureStringHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

export function resolveStoreDiscoveryExposureTimeSlice(
  nowMs: number,
  windowMs = STORE_DISCOVERY_EXPOSURE_WINDOW_MS
): number {
  return Math.floor(nowMs / windowMs);
}

export function resolveStoreDiscoveryExposureBandOffset(
  exposureScope: string,
  timeSlice: number,
  bandLength: number
): number {
  if (bandLength <= 1) return 0;
  const h = deterministicExposureStringHash(`${exposureScope}\0${timeSlice}`);
  return h % bandLength;
}

function rotateBandInPlace<T>(band: T[], offset: number): T[] {
  if (offset === 0 || band.length <= 1) return band;
  const o = offset % band.length;
  return [...band.slice(o), ...band.slice(0, o)];
}

function splitByEligibilityGroups<T extends StoreDiscoveryExposureRow>(
  recommendedSorted: T[],
  eligibilityRankById: Map<string, number>
): T[][] {
  const groups: T[][] = [];
  let currentRank: number | null = null;
  let current: T[] = [];

  for (const row of recommendedSorted) {
    const rank = eligibilityRankById.get(row.id) ?? 99;
    if (currentRank === null || rank !== currentRank) {
      if (current.length > 0) groups.push(current);
      current = [row];
      currentRank = rank;
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Rank-band circular rotation within eligibility groups.
 * Stores never leave their CUT1 rank band or eligibility group.
 */
export function applyStoreDiscoveryExposureRotation<T extends StoreDiscoveryExposureRow>(
  input: StoreDiscoveryExposureInput<T>
): T[] {
  const {
    recommendedSorted,
    eligibilityRankById,
    exposureScope,
    nowMs = Date.now(),
    bandSize = STORE_DISCOVERY_EXPOSURE_BAND_SIZE,
    windowMs = STORE_DISCOVERY_EXPOSURE_WINDOW_MS,
  } = input;

  if (recommendedSorted.length <= 1) return [...recommendedSorted];

  const timeSlice = resolveStoreDiscoveryExposureTimeSlice(nowMs, windowMs);
  const eligibilityGroups = splitByEligibilityGroups(recommendedSorted, eligibilityRankById);
  const out: T[] = [];

  for (const group of eligibilityGroups) {
    if (group.length === 0) continue;
    const size = Math.max(1, Math.floor(bandSize) || STORE_DISCOVERY_EXPOSURE_BAND_SIZE);
    for (let start = 0; start < group.length; start += size) {
      const band = group.slice(start, start + size);
      const bandOffset =
        band.length <= 1 ? 0 : resolveStoreDiscoveryExposureBandOffset(exposureScope, timeSlice, band.length);
      // Same time-slice offset mod band.length — per-band independent rotation
      out.push(...rotateBandInPlace(band, bandOffset));
    }
  }

  return out;
}

export function buildStoreDiscoveryHomeExposureScope(input: {
  region: string | null;
  district: string | null;
  searchQ: string | null;
  originKey: string;
  hasGeo: boolean;
  geoKey: string;
}): string {
  return [
    "home",
    input.region ?? "",
    input.district ?? "",
    input.searchQ ?? "",
    input.originKey,
    input.hasGeo ? input.geoKey : "",
  ].join("\0");
}

export function buildStoreDiscoveryBrowseExposureScope(input: {
  primary: string;
  sub: string;
  regionQ: string;
  cityQ: string;
  district: string | null;
  geoPart: string;
}): string {
  return [
    "browse",
    input.primary,
    input.sub,
    input.regionQ,
    input.cityQ,
    input.district ?? "",
    input.geoPart,
  ].join("\0");
}
