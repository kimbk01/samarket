/**
 * Last committed Marketplace browse scope (CITY or explicit ALL).
 * Not Address SSOT. Used when URL location is unset.
 */
import {
  buildTradeCityScopeFromCanonical,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { sanitizeTradeBrowseRadiusKm } from "@/lib/trade/location/trade-browse-radius";

const KEY = "samarket:trade-browse-committed-scope:v1";

type Stored =
  | { v: 1; mode: "all" }
  | { v: 1; mode: "city"; canonicalId: string; radiusKm: number };

function canUseSession(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function writeTradeBrowseCommittedScope(scope: TradeLocationScope): void {
  if (!canUseSession()) return;
  let stored: Stored | null = null;
  if (scope.mode === "all") stored = { v: 1, mode: "all" };
  else if (scope.mode === "city") {
    stored = {
      v: 1,
      mode: "city",
      canonicalId: scope.canonicalId,
      radiusKm: sanitizeTradeBrowseRadiusKm(scope.radiusKm),
    };
  }
  if (!stored) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* quota */
  }
}

export function peekTradeBrowseCommittedScope(): TradeLocationScope | null {
  if (!canUseSession()) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.mode === "all") return { mode: "all" };
    if (parsed.mode === "city") {
      return buildTradeCityScopeFromCanonical(parsed.canonicalId, parsed.radiusKm);
    }
    return null;
  } catch {
    return null;
  }
}
