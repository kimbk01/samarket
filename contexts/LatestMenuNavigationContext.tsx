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
import { usePathname } from "next/navigation";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { isSamarketNavPerfConsoleEnabled } from "@/lib/debug/samarket-client-console-flags";
import { isCommunityMessengerDeepRoutePath } from "@/lib/navigation/community-messenger-deep-route-path";
import { registerPendingMenuNavigationClear } from "@/lib/navigation/pending-menu-navigation-bridge";
import {
  navPerfFinalizeBottomNavNavigation,
  navPerfMarkInitialHydrated,
  type BottomNavPerfPendingSlice,
} from "@/lib/navigation/nav-perf-browser";
import {
  beginMainHubTransitionFromIntent,
  shouldArmMainHubIntentTransition,
} from "@/lib/navigation/main-hub-transition-authority";

export type MenuNavigationSource =
  | "bottom-nav"
  | "trade-primary"
  | "trade-topic"
  | "community-topic"
  | "category-chip";

export type MenuPendingShellKind = "feed" | "messenger" | null;

import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";

/** @deprecated `mainShellPushAxis` 우선 */
export type MainShellTabSlide = "ltr" | "rtl";

export interface BeginMenuNavigationOptions {
  mainShellTabSlide?: MainShellTabSlide;
  /** 하단 탭 push 슬라이드 축 — `commitMainBottomNavRoute` 가 설정 */
  mainShellPushAxis?: MainShellRoutePushAxis | null;
  /**
   * `(stores)`↔`(main)` remount — dual-panel 은 구 트리에서 끊기므로
   * `AppRouteTransition` 은 session enter 만, exit·dual-panel 은 생략한다.
   */
  mainShellCrossGroupPush?: boolean;
}

export interface MenuNavigationIntent {
  id: number;
  href: string;
  pathname: string;
  search: string;
  source: MenuNavigationSource;
  startedAt: number;
  /** 레거시 — 디버그·향후 용도 */
  mainShellTabSlide?: MainShellTabSlide;
  /** 하단 탭 440ms push 축 */
  mainShellPushAxis?: MainShellRoutePushAxis | null;
  /** `(stores)`↔`(main)` — dual-panel 미사용 */
  mainShellCrossGroupPush?: boolean;
}

interface LatestMenuNavigationContextValue {
  latestNavigationId: number;
  pendingMenuIntent: MenuNavigationIntent | null;
  pendingMenuShellKind: MenuPendingShellKind;
  isPendingMenuBlockingContent: boolean;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => MenuNavigationIntent;
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

function SearchParamsSync({ onSearch }: { onSearch: (next: string) => void }) {
  /** Non-suspending — same SSOT as Owner Admin (`window.location.search`). */
  const searchParams = useOwnerAdminUrlSearchParams();
  const search = searchParams.toString();
  useEffect(() => {
    onSearch(search);
  }, [onSearch, search]);
  return null;
}

export function LatestMenuNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [currentSearch, setCurrentSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return normalizeMenuSearch(window.location.search);
  });
  const latestNavigationIdRef = useRef(0);
  const [latestNavigationId, setLatestNavigationId] = useState(0);
  const [pendingMenuIntent, setPendingMenuIntent] = useState<MenuNavigationIntent | null>(null);
  const navPerfBottomNavRef = useRef<BottomNavPerfPendingSlice | null>(null);

  useEffect(() => {
    navPerfMarkInitialHydrated();
  }, []);

  /** 방·통화 deep route 도착 시 stale mypage/허브 pending intent 가 UI·URL 을 덮지 않게 제거 */
  useEffect(() => {
    if (!pathname || !isCommunityMessengerDeepRoutePath(pathname)) return;
    setPendingMenuIntent((prev) => {
      if (!prev) return prev;
      if (isMenuIntentResolvedByLocation(prev, pathname, currentSearch)) return prev;
      return null;
    });
  }, [pathname, currentSearch]);

  const beginMenuNavigation = useCallback(
    (
      href: string,
      source: MenuNavigationSource = "bottom-nav",
      options?: BeginMenuNavigationOptions
    ) => {
      const perfStart = performance.now();
      const parsed = parseMenuNavigationHref(href);
      const nextIntent: MenuNavigationIntent = {
        id: latestNavigationIdRef.current + 1,
        href: parsed.href,
        pathname: parsed.pathname,
        search: parsed.search,
        source,
        startedAt: Date.now(),
        ...(options?.mainShellTabSlide ? { mainShellTabSlide: options.mainShellTabSlide } : {}),
        ...(options?.mainShellPushAxis ? { mainShellPushAxis: options.mainShellPushAxis } : {}),
        ...(options?.mainShellCrossGroupPush ? { mainShellCrossGroupPush: true } : {}),
      };
      latestNavigationIdRef.current = nextIntent.id;
      setLatestNavigationId(nextIntent.id);
      setPendingMenuIntent(nextIntent);

      /**
       * MAIN hub shell transition START authority = BottomNav intent (sync).
       * Pathname commit only settles — see `main-hub-transition-authority`.
       */
      if (
        shouldArmMainHubIntentTransition({
          source,
          targetPath: nextIntent.pathname,
          fromPath: pathname,
          axis: options?.mainShellPushAxis ?? null,
          crossGroup: Boolean(options?.mainShellCrossGroupPush),
        }) &&
        options?.mainShellPushAxis
      ) {
        beginMainHubTransitionFromIntent({
          intentId: nextIntent.id,
          axis: options.mainShellPushAxis,
          targetPath: nextIntent.pathname,
        });
      }

      const intentCommitMs = Math.round(performance.now() - perfStart);

      if (source === "bottom-nav" && process.env.NODE_ENV === "development" && isSamarketNavPerfConsoleEnabled()) {
        const fromPath = pathname ?? "";
        const wallTs = Date.now();
        const clickStart =
          typeof window !== "undefined" && window.__navPerfLastClickStart != null
            ? window.__navPerfLastClickStart
            : perfStart;
        const idlePreview =
          typeof window !== "undefined" &&
          window.__navPerfLastRouteSettledPerfNow != null &&
          window.__navPerfLastClickStart != null
            ? Math.round(window.__navPerfLastClickStart - window.__navPerfLastRouteSettledPerfNow)
            : null;
        navPerfBottomNavRef.current = {
          intentId: nextIntent.id,
          wallTs,
          clickStart,
          perfIntentEnter: perfStart,
          fromPath,
          toPath: nextIntent.href,
          intentCommitMs,
        };
        console.debug("[nav-perf]", {
          phase: "intent_sync",
          fromPath,
          toPath: nextIntent.href,
          clickTs: wallTs,
          idleBeforeClickMsPreview: idlePreview,
          clickToIntentMs: Math.round(perfStart - clickStart),
          intentCommitMs,
          routePushStartMs: null,
          note: "브라우저 콘솔 전용 — 서버 터미널 미출력. window.__navPerfDump()",
        });
      }

      return nextIntent;
    },
    [pathname]
  );

  const cancelPendingMenuNavigation = useCallback((id?: number) => {
    setPendingMenuIntent((prev) => {
      if (!prev) return prev;
      if (id != null && prev.id !== id) return prev;
      return null;
    });
  }, []);

  useEffect(() => registerPendingMenuNavigationClear(cancelPendingMenuNavigation), [cancelPendingMenuNavigation]);

  useEffect(() => {
    if (!pendingMenuIntent) return;
    if (!isMenuIntentResolvedByLocation(pendingMenuIntent, pathname, currentSearch)) return;

    const b = navPerfBottomNavRef.current;
    if (
      pendingMenuIntent.source === "bottom-nav" &&
      process.env.NODE_ENV === "development" &&
      isSamarketNavPerfConsoleEnabled() &&
      b &&
      b.intentId === pendingMenuIntent.id
    ) {
      b.routeSettledPerfNow = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const slice = navPerfBottomNavRef.current;
          if (!slice || slice.intentId !== pendingMenuIntent.id) return;
          const shellMs = Math.round(performance.now() - slice.clickStart);
          navPerfFinalizeBottomNavNavigation({
            ...slice,
            firstShellPaintApproxMs: shellMs,
          });
          navPerfBottomNavRef.current = null;
        });
      });
    }

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
      <SearchParamsSync onSearch={setCurrentSearch} />
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
