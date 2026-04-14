export const TRADE_SETTINGS_KEY = "trade_detail_ops";

export type TradeDetailOpsSettings = {
  regionEnabled: boolean;
  regionRequired: boolean;
  regionGroups: Record<string, string>;
  similarCount: number;
  adsCount: number;
  fallbackCount: number;
  completedVisibleDays: number;
};

const DEFAULT_REGION_GROUPS: Record<string, string> = {
  manila: "metro-manila",
  quezon: "metro-manila",
  "quezon city": "metro-manila",
  makati: "metro-manila",
  taguig: "metro-manila",
  pasig: "metro-manila",
  pasay: "metro-manila",
};

const DEFAULT_TRADE_SETTINGS: TradeDetailOpsSettings = {
  regionEnabled: true,
  regionRequired: false,
  regionGroups: DEFAULT_REGION_GROUPS,
  similarCount: 8,
  adsCount: 8,
  fallbackCount: 8,
  completedVisibleDays: 7,
};

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

function toDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(60, Math.floor(n)));
}

function toRegionGroups(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return { ...DEFAULT_REGION_GROUPS };
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase();
    const val = typeof rawVal === "string" ? rawVal.trim().toLowerCase() : "";
    if (!key || !val) continue;
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : { ...DEFAULT_REGION_GROUPS };
}

export function mergeTradeDetailOpsSettings(value: unknown): TradeDetailOpsSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    regionEnabled:
      typeof raw.regionEnabled === "boolean"
        ? raw.regionEnabled
        : DEFAULT_TRADE_SETTINGS.regionEnabled,
    regionRequired:
      typeof raw.regionRequired === "boolean"
        ? raw.regionRequired
        : DEFAULT_TRADE_SETTINGS.regionRequired,
    regionGroups: toRegionGroups(raw.regionGroups),
    similarCount: toNumber(raw.similarCount, DEFAULT_TRADE_SETTINGS.similarCount),
    adsCount: toNumber(raw.adsCount, DEFAULT_TRADE_SETTINGS.adsCount),
    fallbackCount: toNumber(raw.fallbackCount, DEFAULT_TRADE_SETTINGS.fallbackCount),
    completedVisibleDays: toDays(raw.completedVisibleDays, DEFAULT_TRADE_SETTINGS.completedVisibleDays),
  };
}
