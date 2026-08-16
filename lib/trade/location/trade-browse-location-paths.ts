/**
 * Marketplace browse location page stack — not trade feed hub surfaces.
 * `/market/location`, `/market/location/distance`, `/market/location/search`
 */

export const TRADE_BROWSE_LOCATION_PATH = "/market/location" as const;
export const TRADE_BROWSE_LOCATION_DISTANCE_PATH = "/market/location/distance" as const;
export const TRADE_BROWSE_LOCATION_SEARCH_PATH = "/market/location/search" as const;

export function isTradeBrowseLocationPath(pathname: string | null | undefined): boolean {
  const raw = typeof pathname === "string" ? pathname : "";
  const safePath = raw.split("?")[0]!.trim();
  if (!safePath) return false;
  return (
    safePath === TRADE_BROWSE_LOCATION_PATH ||
    safePath.startsWith(`${TRADE_BROWSE_LOCATION_PATH}/`)
  );
}
