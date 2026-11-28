/**
 * FIXED-destination back (header ← with a contract target) without a history loop or duplicate.
 *
 * Before: `<Link href={target}>` = push → [target, detail, target]; Android back then returns to detail
 * (detail → list → detail loop). Plain `replace` instead leaves [target, target] when the user came from
 * the target (same list twice).
 *
 * Rule (no fake entries, no timers, no global popstate handling):
 * - previous same-document history entry IS the target → `router.back()` (pop, nothing added)
 * - otherwise → `router.replace(target)` (detail entry swapped for the target; the entry before it is
 *   untouched, so Android/browser back continues to the real previous screen)
 *
 * The previous entry is read from the Navigation API (`navigation.entries()`); Android WebView and
 * iOS 26+ WebKit expose it. Without it, callers may pass `assumePreviousIsTarget` (an in-app entry
 * record for this exact detail); otherwise replace is used.
 */

import { markNextRouteTransitionBack } from "@/lib/navigation/route-transition-back-intent";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

export type FixedDestinationBackRouter = {
  back: () => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
  /** `withoutNavigationApi: "history"` 의 기록 없음 폴백에만 쓴다 */
  push?: (href: string) => void;
};

export type FixedDestinationBackOptions = {
  /** Treat two in-app hrefs as the same screen (e.g. community hub aliases `/` · `/philife`). */
  isSameDestination?: (previousPathAndSearch: string, targetPathAndSearch: string) => boolean;
  /** Only consulted when the Navigation API is unavailable. */
  assumePreviousIsTarget?: () => boolean;
  /**
   * Navigation API 가 없을 때(직전 기록을 읽을 수 없음) 동작.
   * - 기본 `"replace"`: 목적지로 교체 — 목적지에서 왔다면 같은 화면이 2번 남는다.
   * - `"history"`: 기록 뒤로(`runHistoryBackWithFallback`, 기록 없으면 목적지) — 기록을 늘리지 않아 루프·중복이 없다.
   *   고객지원 화면군(Owner 2026-11-26)처럼 「목적지 = 거의 항상 직전 화면」인 곳에 쓴다.
   */
  withoutNavigationApi?: "replace" | "history";
};

export type FixedDestinationBackResult = "back" | "replace";

type NavigationEntryLike = { url?: string | null; index?: number };
type NavigationLike = {
  currentEntry?: NavigationEntryLike | null;
  entries?: () => NavigationEntryLike[];
};

/** `pathname + search`, trailing slash trimmed (root kept), hash dropped. */
export function normalizeInAppHref(href: string, origin?: string): string | null {
  const raw = (href ?? "").trim();
  if (!raw) return null;
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://dibay.local");
  try {
    const u = new URL(raw, base);
    if (u.origin !== base) return null;
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
    return `${path}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Previous same-origin history entry (`pathname + search`), or `null` when unknown
 * (no Navigation API, first entry, cross-origin).
 */
export function readPreviousInAppHistoryHref(): string | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.entries !== "function" || !nav.currentEntry) return null;
  const idx = nav.currentEntry.index;
  if (typeof idx !== "number" || idx < 1) return null;
  let entries: NavigationEntryLike[];
  try {
    entries = nav.entries();
  } catch {
    return null;
  }
  const prev = entries[idx - 1];
  if (!prev?.url) return null;
  return normalizeInAppHref(prev.url, window.location.origin);
}

export function hasNavigationApiHistory(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return Boolean(nav && typeof nav.entries === "function" && nav.currentEntry);
}

export function runFixedDestinationBack(
  router: FixedDestinationBackRouter,
  targetHref: string,
  options: FixedDestinationBackOptions = {}
): FixedDestinationBackResult {
  const target = normalizeInAppHref(targetHref);
  if (target != null && typeof window !== "undefined") {
    if (hasNavigationApiHistory()) {
      const prev = readPreviousInAppHistoryHref();
      const same =
        prev != null &&
        (prev === target || (options.isSameDestination?.(prev, target) ?? false));
      if (same) {
        router.back();
        return "back";
      }
    } else if (options.assumePreviousIsTarget?.()) {
      router.back();
      return "back";
    } else if (options.withoutNavigationApi === "history" && router.push) {
      runHistoryBackWithFallback({ back: router.back, push: router.push }, targetHref);
      return "back";
    }
  }
  /** 뒤로 목적의 바꿔치기 → 화면 전환도 「뒤로」(Owner 결정 3 · `route-transition-back-intent.ts`) */
  markNextRouteTransitionBack(targetHref);
  router.replace(targetHref, { scroll: false });
  return "replace";
}

/** 경로만 비교 — `?from=` 같은 진입 표시가 달라도 같은 화면 */
export function isSamePathDestination(previousPathAndSearch: string, targetPathAndSearch: string): boolean {
  return previousPathAndSearch.split("?")[0] === targetPathAndSearch.split("?")[0];
}

/**
 * 고객지원 화면군(Owner 2026-11-26) 고정 목적지 뒤로 — 기록을 늘리지 않는다.
 * 헤더 ‹(`MyScreen fixedBackHistory="settle"`)와 본문 「목록」 버튼·이탈 확인이 같은 규칙을 쓴다.
 */
export const PATH_SETTLE_BACK_OPTIONS: FixedDestinationBackOptions = {
  isSameDestination: isSamePathDestination,
  withoutNavigationApi: "history",
};

export function runPathSettleBack(
  router: FixedDestinationBackRouter,
  targetHref: string
): FixedDestinationBackResult {
  return runFixedDestinationBack(router, targetHref, PATH_SETTLE_BACK_OPTIONS);
}
