"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Owner Admin layout-safe URL search.
 *
 * `useSearchParams()` in `OwnerHubRuntimeProvider` / `BusinessAdminShell` (layout tree)
 * suspends above page Suspense → hard nav can paint only `Loading…` with no `data-biz` shell.
 *
 * `useSyncExternalStore` over `window.location.search` (server snapshot `""`), notified by
 * popstate / `owner-admin-url-search` for `history.replaceState` query updates.
 * Render reads only the store value — reading `location.search` directly during render
 * made the hydration render differ from SSR (e.g. settlements guide vs ledger).
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
  // Next soft navigations update location.search without popstate — re-sync on pathname tick.
  // Layout effect runs after Next's history update (insertion effect) in the same commit.
  useLayoutEffect(() => {
    if (window.location.search !== search) notifyOwnerAdminUrlSearchChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname tick only
  }, [pathname]);
  return useMemo(() => {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    return new URLSearchParams(raw);
  }, [search]);
}
