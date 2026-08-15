/** Remember last /market* list URL for detail → back (location qs included). */
const TRADE_LIST_RETURN_HREF_KEY = "samarket:trade-list-return:v1";

export function rememberTradeListReturnHref(href: string): void {
  if (typeof window === "undefined") return;
  const h = href.trim();
  if (!h.startsWith("/market")) return;
  try {
    window.sessionStorage.setItem(TRADE_LIST_RETURN_HREF_KEY, h);
  } catch {
    /* ignore quota */
  }
}

export function peekTradeListReturnHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRADE_LIST_RETURN_HREF_KEY)?.trim() ?? "";
    return raw.startsWith("/market") ? raw : null;
  } catch {
    return null;
  }
}
