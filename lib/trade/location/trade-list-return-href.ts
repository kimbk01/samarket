import {
  isRecoverableTradeLocationHydrateInvalid,
  parseTradeLocationScopeFromSearchParams,
} from "@/lib/trade/location/trade-location-scope";

/** Remember last /market* list URL for detail → back (location qs included). */
const TRADE_LIST_RETURN_HREF_KEY = "samarket:trade-list-return:v1";

function parseMarketHref(href: string): { pathname: string; search: string } | null {
  const h = href.trim();
  if (!h.startsWith("/market")) return null;
  const qIdx = h.indexOf("?");
  if (qIdx === -1) return { pathname: h, search: "" };
  return { pathname: h.slice(0, qIdx), search: h.slice(qIdx + 1) };
}

function isPersistableTradeListReturnHref(href: string): boolean {
  const parsed = parseMarketHref(href);
  if (!parsed) return false;
  const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(parsed.search));
  if (scope.mode === "invalid") return false;
  if (isRecoverableTradeLocationHydrateInvalid(scope)) return false;
  return true;
}

function canUseSessionStorage(): boolean {
  return typeof globalThis.sessionStorage !== "undefined";
}

export function rememberTradeListReturnHref(href: string): void {
  if (!canUseSessionStorage()) return;
  if (!isPersistableTradeListReturnHref(href)) return;
  try {
    globalThis.sessionStorage.setItem(TRADE_LIST_RETURN_HREF_KEY, href.trim());
  } catch {
    /* ignore quota */
  }
}

export function peekTradeListReturnHref(): string | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = globalThis.sessionStorage.getItem(TRADE_LIST_RETURN_HREF_KEY)?.trim() ?? "";
    if (!raw.startsWith("/market")) return null;
    if (!isPersistableTradeListReturnHref(raw)) {
      globalThis.sessionStorage.removeItem(TRADE_LIST_RETURN_HREF_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}
