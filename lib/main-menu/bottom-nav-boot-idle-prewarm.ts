"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { prewarmBottomNavTapHrefResolvingStoresRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import { resolveBottomNavTabProgrammaticPrefetchHref } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { resolveMainBottomNavPickTabActiveOptions } from "@/lib/main-menu/main-bottom-nav-pick-context";
import type { MainBottomNavPickContext } from "@/lib/main-menu/main-bottom-nav-pick-context";
import { isApkRemoteWebViewShell } from "@/lib/platform/apk-remote-webview-perf";
import {
  BOTTOM_NAV_PREFETCH_SPREAD_MS,
} from "@/lib/performance/chrome-navigation-policy";
import type { UserRegion } from "@/lib/regions/types";

const BOOT_PREWARM_SESSION_STORAGE_KEY = "dibay:bottom-nav-boot-idle-prewarm:v1";
/** 도메인 간 prewarm·RSC prefetch 간격 (네트워크 폭주 방지) */
export const BOTTOM_NAV_BOOT_PREWARM_STAGGER_MS = 400;

let bootPrewarmMemoryGate = false;
/** Strict Mode remount — idle 전에 동기 commit (2회 schedule 방지) */
let bootPrewarmScheduleCommitted = false;
let bootPrewarmInflight: Promise<void> | null = null;

function readSessionBootGate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(BOOT_PREWARM_SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSessionBootGate(): void {
  try {
    window.sessionStorage.setItem(BOOT_PREWARM_SESSION_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetBottomNavBootIdlePrewarmForTests(): void {
  bootPrewarmMemoryGate = false;
  bootPrewarmScheduleCommitted = false;
  bootPrewarmInflight = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(BOOT_PREWARM_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function pathFromHref(href: string): string {
  return (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

/** 회원 전용 탭 — guest boot prewarm·RSC prefetch 제외 (401·로그인 UI 유발 방지) */
export function shouldBootPrewarmBottomNavHref(href: string): boolean {
  const path = pathFromHref(href);
  const loggedIn = Boolean(getCurrentUser()?.id?.trim());
  if (path === "/mypage" || path === "/my") {
    return loggedIn;
  }
  if (path === "/community-messenger" || path.startsWith("/community-messenger/")) {
    return loggedIn;
  }
  return true;
}

export function collectBottomNavBootPrewarmHrefs(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[],
  ctx?: MainBottomNavPickContext,
): string[] {
  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const activeOpts = resolveMainBottomNavPickTabActiveOptions(pathname, ctx);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const tab of list) {
    if (isMainBottomNavDisplayTabActive(pathname, tab, activeOpts)) continue;
    const href = resolveBottomNavTabProgrammaticPrefetchHref(tab, pathname, ctx).trim();
    if (!href || seen.has(href)) continue;
    if (!shouldBootPrewarmBottomNavHref(href)) continue;
    seen.add(href);
    out.push(href);
  }

  return out;
}

async function runStaggeredBootPrewarm(args: {
  hrefs: string[];
  primaryRegion: UserRegion | null;
  prefetchRoute?: (href: string) => void;
}): Promise<void> {
  for (let i = 0; i < args.hrefs.length; i += 1) {
    const href = args.hrefs[i]!;
    if (args.prefetchRoute) {
      try {
        args.prefetchRoute(href);
      } catch {
        /* ignore */
      }
    }
    try {
      prewarmBottomNavTapHrefResolvingStoresRegion(href, args.primaryRegion);
    } catch {
      /* ignore */
    }
    if (i < args.hrefs.length - 1) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, BOTTOM_NAV_BOOT_PREWARM_STAGGER_MS);
      });
    }
  }
}

export type ScheduleBottomNavBootIdlePrewarmArgs = {
  pathname: string | null;
  tabs: readonly BottomNavItemConfig[];
  primaryRegion: UserRegion | null;
  ctx?: MainBottomNavPickContext;
  prefetchRoute?: (href: string) => void;
};

/**
 * APK 부팅 후 idle 1회 — 비활성 하단 탭 도메인 client prewarm + (선택) RSC prefetch.
 * sessionStorage + in-memory 로 세션당 1회만 실행.
 */
export function scheduleBottomNavBootIdlePrewarm(args: ScheduleBottomNavBootIdlePrewarmArgs): void {
  if (typeof window === "undefined") return;
  if (!isApkRemoteWebViewShell()) return;
  if (bootPrewarmMemoryGate || readSessionBootGate() || bootPrewarmScheduleCommitted) {
    bootPrewarmMemoryGate = true;
    return;
  }
  bootPrewarmScheduleCommitted = true;

  const start = () => {
    if (bootPrewarmMemoryGate) return;
    bootPrewarmMemoryGate = true;
    markSessionBootGate();

    const hrefs = collectBottomNavBootPrewarmHrefs(args.pathname, args.tabs, args.ctx);
    if (hrefs.length === 0) return;

    if (bootPrewarmInflight) return;
    bootPrewarmInflight = runStaggeredBootPrewarm({
      hrefs,
      primaryRegion: args.primaryRegion,
      prefetchRoute: args.prefetchRoute,
    }).finally(() => {
      bootPrewarmInflight = null;
    });
  };

  const idleDelay = BOTTOM_NAV_PREFETCH_SPREAD_MS + BOTTOM_NAV_BOOT_PREWARM_STAGGER_MS;
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => start(), { timeout: 2_500 });
  } else {
    window.setTimeout(start, idleDelay);
  }
}
