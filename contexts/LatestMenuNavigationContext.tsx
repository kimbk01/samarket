"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type MenuNavigationSource =
  | "bottom-nav"
  | "trade-primary"
  | "trade-topic"
  | "community-topic"
  | "category-chip";

export type MenuPendingShellKind = "feed" | "messenger" | null;

export interface MenuNavigationIntent {
  id: number;
  href: string;
  pathname: string;
  search: string;
  source: MenuNavigationSource;
  startedAt: number;
}

interface LatestMenuNavigationContextValue {
  latestNavigationId: number;
  pendingMenuIntent: MenuNavigationIntent | null;
  pendingMenuShellKind: MenuPendingShellKind;
  isPendingMenuBlockingContent: boolean;
  beginMenuNavigation: (href: string, source?: MenuNavigationSource) => MenuNavigationIntent;
  cancelPendingMenuNavigation: (id?: number) => void;
  isPendingMenuHref: (href: string) => boolean;
}

const LatestMenuNavigationContext = createContext<LatestMenuNavigationContextValue | null>(null);

const MENU_INTENT_BASE_URL = "https://samarket.local";

function normalizeMenuPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

function normalizeMenuSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw.trim()) return "";
  const params = new URLSearchParams(raw);
  const pairs = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  const normalized = new URLSearchParams();
  for (const [key, value] of pairs) {
    normalized.append(key, value);
  }
  return normalized.toString();
}

export function buildMenuNavigationHref(pathname: string, search = ""): string {
  const nextPathname = normalizeMenuPathname(pathname);
  const nextSearch = normalizeMenuSearch(search);
  if (!nextPathname) return "";
  return nextSearch ? `${nextPathname}?${nextSearch}` : nextPathname;
}

export function parseMenuNavigationHref(href: string): Pick<MenuNavigationIntent, "href" | "pathname" | "search"> {
  const url = new URL(href, MENU_INTENT_BASE_URL);
  const pathname = normalizeMenuPathname(url.pathname);
  const search = normalizeMenuSearch(url.search);
  return {
    href: buildMenuNavigationHref(pathname, search),
    pathname,
    search,
  };
}

export function menuHrefMatchesIntent(href: string, intent: MenuNavigationIntent | null): boolean {
  if (!intent) return false;
  const next = parseMenuNavigationHref(href);
  return next.pathname === intent.pathname && next.search === intent.search;
}

export function isMenuIntentResolvedByLocation(
  intent: MenuNavigationIntent | null,
  pathname: string | null,
  search: string
): boolean {
  if (!intent) return true;
  const currentPathname = normalizeMenuPathname(pathname ?? "");
  if (!currentPathname) return false;
  if (intent.pathname === "/community-messenger") {
    return currentPathname === "/community-messenger" || currentPathname.startsWith("/community-messenger/");
  }
  return currentPathname === intent.pathname && normalizeMenuSearch(search) === intent.search;
}

function resolvePendingShellKind(intent: MenuNavigationIntent | null): MenuPendingShellKind {
  if (!intent) return null;
  return intent.pathname === "/community-messenger" || intent.pathname.startsWith("/community-messenger/")
    ? "messenger"
    : "feed";
}

export function LatestMenuNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const latestNavigationIdRef = useRef(0);
  const [latestNavigationId, setLatestNavigationId] = useState(0);
  const [pendingMenuIntent, setPendingMenuIntent] = useState<MenuNavigationIntent | null>(null);

  const beginMenuNavigation = useCallback(
    (href: string, source: MenuNavigationSource = "bottom-nav") => {
      const parsed = parseMenuNavigationHref(href);
      const nextIntent: MenuNavigationIntent = {
        id: latestNavigationIdRef.current + 1,
        href: parsed.href,
        pathname: parsed.pathname,
        search: parsed.search,
        source,
        startedAt: Date.now(),
      };
      latestNavigationIdRef.current = nextIntent.id;
      setLatestNavigationId(nextIntent.id);
      setPendingMenuIntent(nextIntent);
      return nextIntent;
    },
    []
  );

  const cancelPendingMenuNavigation = useCallback((id?: number) => {
    setPendingMenuIntent((prev) => {
      if (!prev) return prev;
      if (id != null && prev.id !== id) return prev;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingMenuIntent) return;
    if (!isMenuIntentResolvedByLocation(pendingMenuIntent, pathname, currentSearch)) return;
    setPendingMenuIntent((prev) => (prev?.id === pendingMenuIntent.id ? null : prev));
  }, [pendingMenuIntent, pathname, currentSearch]);

  const isPendingMenuBlockingContent = useMemo(
    () => !isMenuIntentResolvedByLocation(pendingMenuIntent, pathname, currentSearch),
    [pendingMenuIntent, pathname, currentSearch]
  );

  const value = useMemo<LatestMenuNavigationContextValue>(
    () => ({
      latestNavigationId: pendingMenuIntent?.id ?? latestNavigationId,
      pendingMenuIntent,
      pendingMenuShellKind: isPendingMenuBlockingContent
        ? resolvePendingShellKind(pendingMenuIntent)
        : null,
      isPendingMenuBlockingContent,
      beginMenuNavigation,
      cancelPendingMenuNavigation,
      isPendingMenuHref: (href: string) => menuHrefMatchesIntent(href, pendingMenuIntent),
    }),
    [
      beginMenuNavigation,
      cancelPendingMenuNavigation,
      isPendingMenuBlockingContent,
      latestNavigationId,
      pendingMenuIntent,
    ]
  );

  return (
    <LatestMenuNavigationContext.Provider value={value}>
      {children}
    </LatestMenuNavigationContext.Provider>
  );
}

export function useLatestMenuNavigation(): LatestMenuNavigationContextValue {
  const value = useContext(LatestMenuNavigationContext);
  if (!value) {
    throw new Error("useLatestMenuNavigation must be used within LatestMenuNavigationProvider");
  }
  return value;
}
