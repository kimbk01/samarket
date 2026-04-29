/** 거래 희망 장소 픽 후 글쓰기로 돌아올 URL — `/market/trade-meet-spot` 자기 참조 returnTo 방지 */

export const TRADE_MEET_SPOT_RETURN_STORAGE_KEY = "samarket:tradeMeetSpotReturnTo:v1";

/** 지도에서 취소·뒤로가기·확인 후 `/market/{카테고리}` 로 돌아올 때 인라인 거래 글쓰기 시트를 다시 연다 */
const TRADE_WRITE_REOPEN_FLAG = "samarket:tradeWriteReopenAfterMeetSpot:v1";
const TRADE_WRITE_REOPEN_CATEGORY_KEY = "samarket:tradeMeetSpotReturnCategoryKey:v1";

/** `returnTo` 가 `/market/{slugOrId}` 형태일 때 카테고리 키(경로 한 세그먼트) */
export function parseMarketTradeWriteReturnCategoryKey(returnToHref: string): string | null {
  try {
    const path = returnToHref.trim().split("?")[0].split("#")[0];
    const segs = path.split("/").filter(Boolean);
    if (segs[0] !== "market" || segs.length < 2) return null;
    const seg1 = decodeURIComponent(segs[1]);
    if (seg1 === "trade-meet-spot") return null;
    return seg1 || null;
  } catch {
    return null;
  }
}

export function scheduleTradeWriteSheetReopenAfterMeetSpot(returnToHref: string): void {
  const key = parseMarketTradeWriteReturnCategoryKey(returnToHref);
  if (!key) return;
  try {
    sessionStorage.setItem(TRADE_WRITE_REOPEN_FLAG, "1");
    sessionStorage.setItem(TRADE_WRITE_REOPEN_CATEGORY_KEY, key);
  } catch {
    /* quota */
  }
}

/**
 * `…/trade-meet-spot?returnTo=…/trade-meet-spot?…` 처럼 중첩된 returnTo 를 펼쳐 실제 마켓·글쓰기 경로만 남김.
 */
export function normalizeTradeMeetSpotReturnTo(input: string): string {
  let s = input.trim();
  for (let i = 0; i < 8; i++) {
    if (!s.includes("/market/trade-meet-spot")) break;
    const qIdx = s.indexOf("?");
    const pathOnly = qIdx >= 0 ? s.slice(0, qIdx) : s;
    if (pathOnly !== "/market/trade-meet-spot" && !pathOnly.startsWith("/market/trade-meet-spot/")) break;
    const sp =
      qIdx >= 0 ? new URLSearchParams(s.slice(qIdx + 1)) : new URLSearchParams();
    const inner = sp.get("returnTo");
    if (!inner) break;
    s = decodeURIComponent(inner);
  }
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return "/market";
}

/**
 * 지도 픽으로 이동할 때 쓸 returnTo. 현재 URL이 이미 trade-meet-spot 이면 쿼리·세션에서 안쪽 경로를 복구.
 */
export function resolveTradeMeetSpotReturnTo(): string {
  if (typeof window === "undefined") return "/market";

  const full = `${window.location.pathname}${window.location.search}`;
  const normalized = normalizeTradeMeetSpotReturnTo(full);

  if (!full.includes("/market/trade-meet-spot")) {
    try {
      sessionStorage.setItem(TRADE_MEET_SPOT_RETURN_STORAGE_KEY, normalized);
    } catch {
      /* quota */
    }
    return normalized;
  }

  if (!normalized.includes("/market/trade-meet-spot")) {
    try {
      sessionStorage.setItem(TRADE_MEET_SPOT_RETURN_STORAGE_KEY, normalized);
    } catch {
      /* quota */
    }
    return normalized;
  }

  try {
    const stored = sessionStorage.getItem(TRADE_MEET_SPOT_RETURN_STORAGE_KEY);
    if (stored && stored.startsWith("/") && !stored.includes("trade-meet-spot")) {
      return stored;
    }
  } catch {
    /* ignore */
  }

  return "/market";
}
