/**
 * Buyer Marketplace browse radius — pairs with tradeBrowseLocation.
 *
 * Facebook Marketplace PH UI parity presets (not the old 5/10/20/30/50 stub).
 * Recommended is a real applyable km value (not a fake mode).
 */

/** Mid Facebook PH preset — Metro Manila city-grain browse default. Not FB algorithm. */
import { getTradeRadiusOptionsKm, snapTradeRadiusKm } from "@/lib/trade/location/trade-radius-options";

export const TRADE_BROWSE_RECOMMENDED_RADIUS_KM = 64;

/**
 * Default browse (distance 「전체」) nearby tier — LOCAL → NEARBY → NATIONWIDE.
 * Same km as the service's recommended radius (no second distance policy):
 * nearby = LGU centroid within this radius of the anchor City, anchor excluded.
 * Ranking only — never a membership wall (explicit `radius=` is the only hard boundary).
 */
export const TRADE_BROWSE_NEARBY_TIER_RADIUS_KM = TRADE_BROWSE_RECOMMENDED_RADIUS_KM;

/** 거래 D (Owner 2026-10-28): 반경 선택지 초깃값 10·20·40km — 실제 값은 어드민 설정(`trade-radius-options.ts`) */
export const TRADE_BROWSE_RADIUS_PRESET_KM = [10, 20, 40] as const;

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

/**
 * Parse URL radius when CITY scope is active. Missing → null (distance 전체). ALL → null.
 * Non-numeric (`radius=abc`) → null too — no silent 64km fallback (BR-8, TM-10b).
 */
export function parseTradeBrowseRadiusKmFromSearchParams(
  params: URLSearchParams | { get: (k: string) => string | null },
  locationIsCity: boolean
): number | null {
  if (!locationIsCity) return null;
  const raw = params.get(TRADE_LOCATION_RADIUS_PARAM);
  if (raw == null || !String(raw).trim()) return null;
  if (!Number.isFinite(Number.parseInt(String(raw).trim(), 10))) return null;
  /** 거래 D: 옛 주소(`radius=5`·`32`·`64`…)는 반경 선택지 중 가장 가까운 값으로 읽는다(서버는 어드민 값으로 한 번 더 맞춘다) */
  return snapTradeRadiusKm(sanitizeTradeBrowseRadiusKm(raw), getTradeRadiusOptionsKm());
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
