/**
 * Draft bridge for `/market/location` page stack.
 * Seed from committed URL on pin open; persist across distance/search; clear on commit.
 */

import {
  cloneTradeBrowseLocation,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import {
  cloneTradeBrowseRadiusSelection,
  defaultTradeBrowseRadiusSelection,
  sanitizeTradeBrowseRadiusKm,
  TRADE_BROWSE_RADIUS_PRESET_KM,
  TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
  type TradeBrowseRadiusSelection,
} from "@/lib/trade/location/trade-browse-radius";

export const TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY = "trade_browse_location_draft_v1" as const;
export const TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION = 1 as const;

export type TradeBrowseLocationDraftSession = {
  schemaVersion: typeof TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION;
  location: TradeBrowseLocation;
  radius: TradeBrowseRadiusSelection;
};

function parseRadius(raw: unknown): TradeBrowseRadiusSelection {
  if (!raw || typeof raw !== "object") return defaultTradeBrowseRadiusSelection();
  const o = raw as { mode?: string; km?: unknown };
  const km = sanitizeTradeBrowseRadiusKm(o.km);
  if (o.mode === "recommended" || km === TRADE_BROWSE_RECOMMENDED_RADIUS_KM) {
    return { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
  }
  if (
    o.mode === "preset" &&
    (TRADE_BROWSE_RADIUS_PRESET_KM as readonly number[]).includes(km)
  ) {
    return {
      mode: "preset",
      km: km as (typeof TRADE_BROWSE_RADIUS_PRESET_KM)[number],
    };
  }
  if (o.mode === "custom") return { mode: "custom", km };
  return tradeBrowseRadiusSelectionFromKmLoose(km);
}

function tradeBrowseRadiusSelectionFromKmLoose(km: number): TradeBrowseRadiusSelection {
  if (km === TRADE_BROWSE_RECOMMENDED_RADIUS_KM) {
    return { mode: "recommended", km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
  }
  if ((TRADE_BROWSE_RADIUS_PRESET_KM as readonly number[]).includes(km)) {
    return {
      mode: "preset",
      km: km as (typeof TRADE_BROWSE_RADIUS_PRESET_KM)[number],
    };
  }
  return { mode: "custom", km };
}

function parseLocation(raw: unknown): TradeBrowseLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as {
    kind?: string;
    canonicalId?: unknown;
    displayName?: unknown;
    radiusKm?: unknown;
    lat?: unknown;
    lng?: unknown;
  };
  if (o.kind === "all") return { kind: "all" };
  if (o.kind !== "city") return null;
  const canonicalId = typeof o.canonicalId === "string" ? o.canonicalId.trim() : "";
  const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
  if (!canonicalId || !displayName) return null;
  const loc: TradeBrowseLocation = {
    kind: "city",
    canonicalId,
    displayName,
  };
  if (typeof o.radiusKm === "number" && Number.isFinite(o.radiusKm)) {
    loc.radiusKm = sanitizeTradeBrowseRadiusKm(o.radiusKm);
  }
  if (typeof o.lat === "number" && Number.isFinite(o.lat)) loc.lat = o.lat;
  if (typeof o.lng === "number" && Number.isFinite(o.lng)) loc.lng = o.lng;
  return loc;
}

export function createTradeBrowseLocationDraftSession(
  location: TradeBrowseLocation,
  radius?: TradeBrowseRadiusSelection
): TradeBrowseLocationDraftSession {
  const loc = cloneTradeBrowseLocation(location);
  let rad = radius
    ? cloneTradeBrowseRadiusSelection(radius)
    : defaultTradeBrowseRadiusSelection();
  if (loc.kind === "city" && typeof loc.radiusKm === "number") {
    rad = tradeBrowseRadiusSelectionFromKmLoose(loc.radiusKm);
  }
  return {
    schemaVersion: TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION,
    location: loc,
    radius: rad,
  };
}

export function readTradeBrowseLocationDraftSession(): TradeBrowseLocationDraftSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw) as {
      schemaVersion?: unknown;
      location?: unknown;
      radius?: unknown;
    };
    if (json.schemaVersion !== TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION) return null;
    const location = parseLocation(json.location);
    if (!location) return null;
    return {
      schemaVersion: TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION,
      location: cloneTradeBrowseLocation(location),
      radius: parseRadius(json.radius),
    };
  } catch {
    return null;
  }
}

export function writeTradeBrowseLocationDraftSession(
  session: TradeBrowseLocationDraftSession
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: TradeBrowseLocationDraftSession = {
      schemaVersion: TRADE_BROWSE_LOCATION_DRAFT_SCHEMA_VERSION,
      location: cloneTradeBrowseLocation(session.location),
      radius: cloneTradeBrowseRadiusSelection(session.radius),
    };
    sessionStorage.setItem(TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearTradeBrowseLocationDraftSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(TRADE_BROWSE_LOCATION_DRAFT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function seedTradeBrowseLocationDraftSession(
  location: TradeBrowseLocation,
  radius?: TradeBrowseRadiusSelection
): TradeBrowseLocationDraftSession {
  const session = createTradeBrowseLocationDraftSession(location, radius);
  writeTradeBrowseLocationDraftSession(session);
  return session;
}
