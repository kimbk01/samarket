const TRADE_REGION_GROUP_MAP: Record<string, string> = {
  manila: "metro-manila",
  quezon: "metro-manila",
  "quezon city": "metro-manila",
  makati: "metro-manila",
  taguig: "metro-manila",
  pasig: "metro-manila",
  pasay: "metro-manila",
  mandaluyong: "metro-manila",
  caloocan: "metro-manila",
  parañaque: "metro-manila",
  paranaque: "metro-manila",
  malabon: "metro-manila",
  navotas: "metro-manila",
  laspiñas: "metro-manila",
  "las pinas": "metro-manila",
  muntinlupa: "metro-manila",
};

function normalizeRegionToken(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

function mergedRegionGroupMap(
  override: Record<string, string> | null | undefined
): Record<string, string> {
  if (!override || Object.keys(override).length === 0) {
    return TRADE_REGION_GROUP_MAP;
  }
  return { ...TRADE_REGION_GROUP_MAP, ...override };
}

export function resolveRegionGroup(
  regionId: string | null | undefined,
  override?: Record<string, string> | null
): string | null {
  const key = normalizeRegionToken(regionId);
  if (!key) return null;
  const map = mergedRegionGroupMap(override);
  return map[key] ?? null;
}

export function isGlobalRegion(regionId: string | null | undefined): boolean {
  return normalizeRegionToken(regionId).length === 0;
}

export function matchRegionOrGlobal(
  candidateRegionId: string | null | undefined,
  targetRegionId: string | null | undefined
): boolean {
  const c = normalizeRegionToken(candidateRegionId);
  const t = normalizeRegionToken(targetRegionId);
  if (!t) return true;
  if (!c) return true;
  return c === t;
}

export function matchRegionGroupOrGlobal(
  candidateRegionId: string | null | undefined,
  targetRegionId: string | null | undefined,
  override?: Record<string, string> | null
): boolean {
  const t = normalizeRegionToken(targetRegionId);
  if (!t) return true;
  const c = normalizeRegionToken(candidateRegionId);
  if (!c) return true;
  const targetGroup = resolveRegionGroup(t, override);
  const candidateGroup = resolveRegionGroup(c, override);
  if (!targetGroup || !candidateGroup) return false;
  return targetGroup === candidateGroup;
}
