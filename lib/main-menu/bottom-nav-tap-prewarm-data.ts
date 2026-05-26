"use client";

/**
 * 하단 탭 `pointerdown` 직후 클라이언트 데이터 prewarm — 도메인별 모듈을 **지연 import** 해
 * `/stores` 첫 진입 시 philife·trade·messenger prewarm 그래프가 BottomNav 청크에 묶이지 않게 한다.
 */

import { prewarmBottomNavStoresTab, type BottomNavStoresPrewarmOptions } from "@/lib/main-menu/bottom-nav-tap-prewarm-stores";

export type BottomNavTapPrewarmOptions = BottomNavStoresPrewarmOptions;

export function prewarmBottomNavTapTargetClientCache(
  href: string,
  opts: BottomNavTapPrewarmOptions = {}
): void {
  if (typeof window === "undefined") return;
  if (!href || typeof href !== "string") return;
  const path = (href.split("?")[0] ?? "").trim();
  if (!path) return;

  if (path === "/stores") {
    prewarmBottomNavStoresTab(opts);
    return;
  }

  if (path === "/market" || path.startsWith("/market/")) {
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-trade").then((m) =>
      m.prewarmBottomNavMarketTab(path)
    );
    return;
  }

  if (path === "/philife") {
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-philife").then((m) => m.prewarmBottomNavPhilifeTab());
    return;
  }

  if (path === "/community-messenger") {
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-messenger").then((m) => m.prewarmBottomNavMessengerTab());
    return;
  }

  if (path === "/mypage") {
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-mypage").then((m) => m.prewarmBottomNavMypageTab());
    return;
  }
}
