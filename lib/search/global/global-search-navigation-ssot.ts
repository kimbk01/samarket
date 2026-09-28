/**
 * Global Search entry / close / return SSOT.
 * Origin lives in session/navigation state — never as a public Search URL query.
 * Entry domain intent is a separate session key — never inferred from return href.
 */

import {
  clearGlobalSearchEntryDomain,
  type GlobalSearchEntryDomain,
  writeGlobalSearchEntryDomain,
} from "@/lib/search/global/semantics/entry-domain";

export const GLOBAL_SEARCH_HREF = "/search";
export const GLOBAL_SEARCH_NO_ORIGIN_FALLBACK = "/philife";

export type OpenGlobalSearchOptions = {
  domain?: GlobalSearchEntryDomain;
  currentHref?: string;
};

const ORIGIN_STORAGE_KEY = "dibay_global_search_entry_origin_v1";

let memoryOrigin: string | null = null;

export type GlobalSearchPushRouter = {
  push: (href: string) => void;
};

export type GlobalSearchReplaceRouter = {
  replace: (href: string) => void;
};

function pathOnly(href: string): string {
  return href.split("?")[0]!.split("#")[0]!;
}

export function isGlobalSearchPath(pathname: string): boolean {
  const p = pathOnly((pathname ?? "").trim());
  return p === GLOBAL_SEARCH_HREF || p.startsWith(`${GLOBAL_SEARCH_HREF}/`);
}

/** pathname + search + hash. Empty when unusable or when the href is /search itself. */
export function normalizeExactOriginHref(href: string): string {
  const trimmed = (href ?? "").trim();
  if (!trimmed) return "";

  let exact = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      exact = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return "";
  }

  if (!exact.startsWith("/")) return "";
  if (isGlobalSearchPath(exact)) return "";
  return exact;
}

export function captureExactOriginHref(currentHref?: string): string {
  if (currentHref != null) return normalizeExactOriginHref(currentHref);
  if (typeof window === "undefined") return "";
  return normalizeExactOriginHref(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

function readSessionOrigin(): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(ORIGIN_STORAGE_KEY);
    return raw != null && raw !== "" ? raw : null;
  } catch {
    return null;
  }
}

function writeSessionOrigin(value: string | null): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (value == null || value === "") {
      sessionStorage.removeItem(ORIGIN_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ORIGIN_STORAGE_KEY, value);
  } catch {
    /* private mode / blocked storage */
  }
}

export function getGlobalSearchEntryOrigin(): string | null {
  const stored = readSessionOrigin();
  if (stored) {
    const exact = normalizeExactOriginHref(stored);
    return exact || null;
  }
  if (memoryOrigin) {
    const exact = normalizeExactOriginHref(memoryOrigin);
    return exact || null;
  }
  return null;
}

export function setGlobalSearchEntryOrigin(href: string): void {
  const exact = normalizeExactOriginHref(href);
  memoryOrigin = exact || null;
  writeSessionOrigin(memoryOrigin);
}

export function clearGlobalSearchEntryOrigin(): void {
  memoryOrigin = null;
  writeSessionOrigin(null);
}

export function resolveGlobalSearchCloseHref(): string {
  return getGlobalSearchEntryOrigin() ?? GLOBAL_SEARCH_NO_ORIGIN_FALLBACK;
}

export function openGlobalSearchFromHere(
  router: GlobalSearchPushRouter,
  currentHrefOrOptions?: string | OpenGlobalSearchOptions
): void {
  const options: OpenGlobalSearchOptions =
    typeof currentHrefOrOptions === "string"
      ? { currentHref: currentHrefOrOptions }
      : currentHrefOrOptions ?? {};
  const origin = captureExactOriginHref(options.currentHref);
  if (origin) setGlobalSearchEntryOrigin(origin);
  if (options.domain) writeGlobalSearchEntryDomain(options.domain);
  router.push(GLOBAL_SEARCH_HREF);
}

export function closeGlobalSearch(router: GlobalSearchReplaceRouter): void {
  const dest = resolveGlobalSearchCloseHref();
  clearGlobalSearchEntryOrigin();
  clearGlobalSearchEntryDomain();
  router.replace(dest);
}
