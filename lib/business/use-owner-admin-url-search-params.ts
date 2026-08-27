"use client";

import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Owner Admin layout-safe URL search.
 *
 * `useSearchParams()` in `OwnerHubRuntimeProvider` / `BusinessAdminShell` (layout tree)
 * suspends above page Suspense → hard nav can paint only `Loading…` with no `data-biz` shell.
 *
 * Same approach as messenger room URL reads: `window.location.search` + pathname,
 * plus popstate / `owner-admin-url-search` for `history.replaceState` query updates.
 *
 * @see lib/community-messenger/room/use-messenger-room-url-search-params.ts
 * @see lib/business/owner-orders-url.ts
 */
const OWNER_ADMIN_URL_SEARCH_EVENT = "owner-admin-url-search";

function subscribeOwnerAdminUrlSearch(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", onChange);
  window.addEventListener(OWNER_ADMIN_URL_SEARCH_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(OWNER_ADMIN_URL_SEARCH_EVENT, onChange);
  };
}

function getOwnerAdminUrlSearchSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getOwnerAdminUrlSearchServerSnapshot(): string {
  return "";
}

/** Call after `history.replaceState` / `pushState` that changes Owner Admin query. */
export function notifyOwnerAdminUrlSearchChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OWNER_ADMIN_URL_SEARCH_EVENT));
}

export function useOwnerAdminUrlSearchParams(): URLSearchParams {
  const pathname = usePathname() ?? "";
  const search = useSyncExternalStore(
    subscribeOwnerAdminUrlSearch,
    getOwnerAdminUrlSearchSnapshot,
    getOwnerAdminUrlSearchServerSnapshot
  );
  return useMemo(() => {
    void pathname;
    // Next soft navigations update location.search without popstate — re-read on pathname tick.
    const live =
      typeof window !== "undefined" ? window.location.search : search;
    const raw = live.startsWith("?") ? live.slice(1) : live;
    return new URLSearchParams(raw);
  }, [pathname, search]);
}
