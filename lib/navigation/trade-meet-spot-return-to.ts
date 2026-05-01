/** 거래 희망 장소 픽 후 글쓰기로 돌아올 URL — `/market/trade-meet-spot` 자기 참조 returnTo 방지 */

export const TRADE_MEET_SPOT_RETURN_STORAGE_KEY = "samarket:tradeMeetSpotReturnTo:v1";

/** 지도에서 취소·뒤로가기·확인 후 `/market/{카테고리}` 로 돌아올 때 인라인 거래 글쓰기 시트를 다시 연다 — `TradeWriteSheetContext` 와 동일 키 */
export const TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY = "samarket:tradeWriteReopenAfterMeetSpot:v1";
export const TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY = "samarket:tradeMeetSpotReturnCategoryKey:v1";

/**
 * 거래 희망 장소 화면에서 글쓰기로 돌아올 때 `작성 중이던 글이 있습니다` 모달을 띄우지 않음.
 * (확인·취소 모두 동일 — 이미 세션 초안으로 이어 쓰는 흐름)
 */
const TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY = "samarket:tradeWriteSkipDraftResumeAfterMeetSpot:v1";

let skipDraftPromptClearMicrotaskScheduled = false;

export function markTradeWriteSkipPersistedDraftPromptAfterMeetSpot(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY, "1");
  } catch {
    /* quota */
  }
}

/** 복원 확인 시트를 건너뛸지(제거 없이 읽기만) — React Strict Mode 이중 layout 대비 */
export function peekTradeWriteSkipPersistedDraftPromptAfterMeetSpot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 스킵 플래그 제거를 현재 턴 직후로 미룸 — 동기 `remove` 시 Strict 이중 layout 에서 모달 재등장 방지.
 * 한 번만 큐에 넣어 이중 layout·재실행 시 `removeItem` 중복 호출을 줄임.
 */
export function scheduleClearTradeWriteSkipPersistedDraftPromptAfterMeetSpot(): void {
  if (typeof window === "undefined") return;
  if (skipDraftPromptClearMicrotaskScheduled) return;
  skipDraftPromptClearMicrotaskScheduled = true;
  queueMicrotask(() => {
    skipDraftPromptClearMicrotaskScheduled = false;
    try {
      sessionStorage.removeItem(TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY);
    } catch {
      /* ignore */
    }
  });
}

/** @deprecated 레이아웃에서는 `peek` + `scheduleClear` 사용 권장 */
export function consumeTradeWriteSkipPersistedDraftPromptAfterMeetSpot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY) !== "1") return false;
    sessionStorage.removeItem(TRADE_WRITE_SKIP_DRAFT_RESUME_AFTER_MEET_SPOT_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 거래 글쓰기 → 거래 희망 장소 풀페이지 */
export function hrefTradeMeetSpotPick(returnToHref: string): string {
  const q = new URLSearchParams();
  q.set("returnTo", returnToHref);
  return `/market/trade-meet-spot?${q.toString()}`;
}

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
    sessionStorage.setItem(TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY, "1");
    sessionStorage.setItem(TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY, key);
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
