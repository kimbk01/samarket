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

export type FixedDestinationBackRouter = {
  back: () => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

export type FixedDestinationBackOptions = {
  /** Treat two in-app hrefs as the same screen (e.g. community hub aliases `/` · `/philife`). */
  isSameDestination?: (previousPathAndSearch: string, targetPathAndSearch: string) => boolean;
  /** Only consulted when the Navigation API is unavailable. */
  assumePreviousIsTarget?: () => boolean;
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
    }
  }
  router.replace(targetHref, { scroll: false });
  return "replace";
}
