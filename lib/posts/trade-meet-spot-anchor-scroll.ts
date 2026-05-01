/** 거래 희망 장소 블록 앵커 — 글쓰기 폼 간 공통 */

export const TRADE_MEET_SPOT_SCROLL_ANCHOR_ID = "trade-meet-spot-scroll-anchor";

const TRADE_MEET_SPOT_SCROLL_RESTORE_KEY = "samarket:tradeMeetSpotScrollRestore:v1";
const TRADE_MEET_SPOT_FOCUS_ON_RETURN_KEY = "samarket:tradeMeetSpotFocusOnReturn:v1";

function findNearestScrollableParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const style = window.getComputedStyle(p);
    const canScroll =
      (style.overflowY === "auto" || style.overflowY === "scroll") && p.scrollHeight > p.clientHeight;
    if (canScroll) return p;
    p = p.parentElement;
  }
  return null;
}

export function scrollTradeMeetSpotAnchorIntoView(): void {
  if (typeof window === "undefined") return;
  const anchor = document.getElementById(TRADE_MEET_SPOT_SCROLL_ANCHOR_ID) as HTMLElement | null;
  if (!anchor) return;
  const scrollParent = findNearestScrollableParent(anchor);
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const delta = anchorRect.top - parentRect.top - Math.max(16, Math.floor(parentRect.height * 0.18));
    scrollParent.scrollTo({ top: Math.max(0, scrollParent.scrollTop + delta), behavior: "auto" });
  } else {
    anchor.scrollIntoView({ block: "center", behavior: "auto" });
  }
}

export function persistTradeMeetSpotReturnScrollPosition(): void {
  if (typeof window === "undefined") return;
  const anchor = document.getElementById(TRADE_MEET_SPOT_SCROLL_ANCHOR_ID);
  const scrollParent = findNearestScrollableParent(anchor as HTMLElement | null);
  try {
    window.sessionStorage.setItem(
      TRADE_MEET_SPOT_SCROLL_RESTORE_KEY,
      JSON.stringify({
        type: scrollParent ? "container" : "window",
        top: scrollParent ? scrollParent.scrollTop : window.scrollY,
      })
    );
  } catch {
    /* quota */
  }
}

export function markTradeMeetSpotFocusOnReturn(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TRADE_MEET_SPOT_FOCUS_ON_RETURN_KEY, "1");
  } catch {
    /* quota */
  }
}

export function consumeTradeMeetSpotFocusOnReturn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(TRADE_MEET_SPOT_FOCUS_ON_RETURN_KEY);
    if (v === "1") {
      window.sessionStorage.removeItem(TRADE_MEET_SPOT_FOCUS_ON_RETURN_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function restoreTradeMeetSpotReturnScrollPosition(): void {
  if (typeof window === "undefined") return;
  let payload: { type: "container" | "window"; top: number } | null = null;
  try {
    const raw = window.sessionStorage.getItem(TRADE_MEET_SPOT_SCROLL_RESTORE_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(TRADE_MEET_SPOT_SCROLL_RESTORE_KEY);
    const parsed = JSON.parse(raw) as Partial<{ type: "container" | "window"; top: number }>;
    if ((parsed.type !== "container" && parsed.type !== "window") || typeof parsed.top !== "number") return;
    payload = { type: parsed.type, top: parsed.top };
  } catch {
    return;
  }
  const apply = () => {
    const anchor = document.getElementById(TRADE_MEET_SPOT_SCROLL_ANCHOR_ID) as HTMLElement | null;
    const scrollParent = findNearestScrollableParent(anchor);
    if (payload?.type === "container" && scrollParent) {
      scrollParent.scrollTop = payload.top;
      return;
    }
    window.scrollTo({ top: Math.max(0, payload?.top ?? 0), behavior: "auto" });
    if (anchor) {
      anchor.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}
