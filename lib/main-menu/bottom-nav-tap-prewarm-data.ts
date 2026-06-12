"use client";

/**
 * 하단 탭 `pointerdown` 직후 클라이언트 데이터 prewarm — 도메인별 모듈을 **지연 import** 해
 * `/stores` 첫 진입 시 philife·trade·messenger prewarm 그래프가 BottomNav 청크에 묶이지 않게 한다.
 */

import { isDeliveryConsumerBottomNavSurface } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { prewarmBottomNavStoresTab, type BottomNavStoresPrewarmOptions } from "@/lib/main-menu/bottom-nav-tap-prewarm-stores";

export type BottomNavTapPrewarmSource = "pointer_intent" | "route_commit" | "boot" | "idle";

export type BottomNavTapPrewarmOptions = BottomNavStoresPrewarmOptions & {
  /** 기본 `pointer_intent` — 배달 허브에서 메신저 ambient warm 은 skip, `route_commit` 만 허용 */
  source?: BottomNavTapPrewarmSource;
};

function isMessengerPrewarmPath(path: string): boolean {
  return path === "/community-messenger" || path.startsWith("/community-messenger/");
}

/** 배달·주문 허브 체류 중 hover/pointerdown 메신저 warm 금지 — 탭 commit 직후만 (배민 E축 quiet) */
export function shouldDeferMessengerPrewarmOnDeliverySurface(
  pathname: string | null | undefined,
  source: BottomNavTapPrewarmSource = "pointer_intent"
): boolean {
  if (source === "route_commit" || source === "boot") return false;
  return isDeliveryConsumerBottomNavSurface(pathname);
}

export function prewarmBottomNavTapTargetClientCache(
  href: string,
  opts: BottomNavTapPrewarmOptions = {}
): void {
  if (typeof window === "undefined") return;
  if (!href || typeof href !== "string") return;
  const path = (href.split("?")[0] ?? "").trim();
  if (!path) return;
  const source = opts.source ?? "pointer_intent";

  if (path === "/stores") {
    prewarmBottomNavStoresTab({
      ...opts,
      clientCallSource: "bottom_nav_prewarm",
    });
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

  if (isMessengerPrewarmPath(path)) {
    if (shouldDeferMessengerPrewarmOnDeliverySurface(window.location.pathname, source)) {
      return;
    }
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-messenger").then((m) => m.prewarmBottomNavMessengerTab());
    return;
  }

  if (path === "/mypage") {
    void import("@/lib/main-menu/bottom-nav-tap-prewarm-mypage").then((m) => m.prewarmBottomNavMypageTab());
    return;
  }
}
