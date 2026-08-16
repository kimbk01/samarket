/**
 * Buyer Marketplace browse radius — pairs with tradeBrowseLocation.
 *
 * Facebook Marketplace PH UI parity presets (not the old 5/10/20/30/50 stub).
 * Recommended is a real applyable km value (not a fake mode).
 */

/** Mid Facebook PH preset — Metro Manila city-grain browse default. Not FB algorithm. */
export const TRADE_BROWSE_RECOMMENDED_RADIUS_KM = 64;

export const TRADE_BROWSE_RADIUS_PRESET_KM = [32, 64, 96, 160] as const;

export const TRADE_BROWSE_RADIUS_MIN_KM = 1;
export const TRADE_BROWSE_RADIUS_MAX_KM = 500;

export const TRADE_LOCATION_RADIUS_PARAM = "radius" as const;

export type TradeBrowseRadiusSelection =
  | { mode: "recommended"; km: typeof TRADE_BROWSE_RECOMMENDED_RADIUS_KM }
  | { mode: "preset"; km: (typeof TRADE_BROWSE_RADIUS_PRESET_KM)[number] }
  | { mode: "custom"; km: number };

export function sanitizeTradeBrowseRadiusKm(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return TRADE_BROWSE_RECOMMENDED_RADIUS_KM;
  return Math.min(
    TRADE_BROWSE_RADIUS_MAX_KM,
    Math.max(TRADE_BROWSE_RADIUS_MIN_KM, Math.round(n))
  );
}

export function defaultTradeBrowseRadiusSelection(): TradeBrowseRadiusSelection {
  return { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
}

export function tradeBrowseRadiusSelectionFromKm(km: number): TradeBrowseRadiusSelection {
  const sanitized = sanitizeTradeBrowseRadiusKm(km);
  if (sanitized === TRADE_BROWSE_RECOMMENDED_RADIUS_KM) {
    return { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
  }
  if (
    (TRADE_BROWSE_RADIUS_PRESET_KM as readonly number[]).includes(sanitized)
  ) {
    return {
      mode: "preset",
      km: sanitized as (typeof TRADE_BROWSE_RADIUS_PRESET_KM)[number],
    };
  }
  return { mode: "custom", km: sanitized };
}

export function cloneTradeBrowseRadiusSelection(
  sel: TradeBrowseRadiusSelection
): TradeBrowseRadiusSelection {
  if (sel.mode === "recommended") {
    return { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
  }
  if (sel.mode === "preset") return { mode: "preset", km: sel.km };
  return { mode: "custom", km: sanitizeTradeBrowseRadiusKm(sel.km) };
}

export function tradeBrowseRadiusSelectionEquals(
  a: TradeBrowseRadiusSelection,
  b: TradeBrowseRadiusSelection
): boolean {
  return a.mode === b.mode && a.km === b.km;
}

/** Parse URL radius when CITY scope is active. Missing → recommended. ALL → null. */
export function parseTradeBrowseRadiusKmFromSearchParams(
  params: URLSearchParams | { get: (k: string) => string | null },
  locationIsCity: boolean
): number | null {
  if (!locationIsCity) return null;
  const raw = params.get(TRADE_LOCATION_RADIUS_PARAM);
  if (raw == null || !String(raw).trim()) return TRADE_BROWSE_RECOMMENDED_RADIUS_KM;
  return sanitizeTradeBrowseRadiusKm(raw);
}

export function applyTradeBrowseRadiusToSearchParams(
  params: URLSearchParams,
  radiusKm: number | null
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (radiusKm == null) {
    next.delete(TRADE_LOCATION_RADIUS_PARAM);
  } else {
    next.set(TRADE_LOCATION_RADIUS_PARAM, String(sanitizeTradeBrowseRadiusKm(radiusKm)));
  }
  return next;
}

export function tradeBrowseRadiusCacheSegment(radiusKm: number | null | undefined): string {
  if (radiusKm == null) return "r:none";
  return `r:${sanitizeTradeBrowseRadiusKm(radiusKm)}`;
}

export function formatTradeBrowseRadiusLabelKm(km: number): string {
  return `${sanitizeTradeBrowseRadiusKm(km)}km`;
}
