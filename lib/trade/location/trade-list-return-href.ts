import {
  isRecoverableTradeLocationHydrateInvalid,
  parseTradeLocationScopeFromSearchParams,
} from "@/lib/trade/location/trade-location-scope";

/** Remember last /market* or Global Search `/search?q=` list URL for detail → back. */
const TRADE_LIST_RETURN_HREF_KEY = "samarket:trade-list-return:v1";

function parsePersistableHref(href: string): { pathname: string; search: string } | null {
  const h = href.trim();
  if (!h.startsWith("/")) return null;
  const qIdx = h.indexOf("?");
  const pathname = qIdx === -1 ? h : h.slice(0, qIdx);
  const search = qIdx === -1 ? "" : h.slice(qIdx + 1);
  if (pathname === "/search") return { pathname, search };
  if (pathname.startsWith("/market")) return { pathname, search };
  return null;
}

function isPersistableTradeListReturnHref(href: string): boolean {
  const parsed = parsePersistableHref(href);
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
    if (!parsePersistableHref(raw)) return null;
    if (!isPersistableTradeListReturnHref(raw)) {
      globalThis.sessionStorage.removeItem(TRADE_LIST_RETURN_HREF_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * 거래 상세 헤더 ← 목적지 (지정 #9) — FIXED 계약(목록으로) 유지, 「어느 목록」만 정확히.
 * 기억된 목록은 마지막으로 본 목록일 뿐이라 채팅·찜·알림에서 상세로 들어오면 오래된 목록으로 갔다.
 * - 직전 기록이 거래 목록·검색 → 그 목록
 * - 직전 기록이 다른 거래 상세(관련 상품) → 기억된 목록 (목록 → 상세 → 상세)
 * - 직전 기록이 그 밖의 화면(채팅·찜·알림 등) → 카테고리 목록
 * - 직전 기록을 알 수 없음(Navigation API 없음·첫 기록) → 기존 동작(기억된 목록 → 카테고리)
 */
export function resolveTradeDetailListReturnHref(input: {
  previousHref: string | null;
  remembered: string | null;
  categoryHref: string;
}): string {
  const { previousHref, remembered, categoryHref } = input;
  if (previousHref == null) return remembered || categoryHref;
  if (isPersistableTradeListReturnHref(previousHref)) return previousHref;
  const prevPath = previousHref.split("?")[0] ?? "";
  if (/^\/post\/[^/]+$/.test(prevPath)) return remembered || categoryHref;
  return categoryHref;
}
