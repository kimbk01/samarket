"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
import { TradeMarketTabPushEnterPanel } from "@/components/market/TradeMarketTabPushEnterPanel";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { StoresHub } from "@/components/stores/StoresHub";
import { MyContent } from "@/app/(main)/my/MyContent";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { isCommunityMessengerDeepRoutePath } from "@/lib/navigation/community-messenger-deep-route-path";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";

type Props = {
  children: React.ReactNode;
  /** 하단 탭 서버 프라임과의 시그니처 호환 — 슬라이드 방향은 canonical pathname 만 사용 */
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

function isMarketMenuIntentPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").trim();
  return p === "/market" || p.startsWith("/market/");
}

function StableMainTabEnterPanel() {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app" aria-hidden />;
}

function DeferredMainTabEnterPanel({ href }: { href: string }) {
  const [ready, setReady] = useState(false);
  const { pathname, search } = useMemo(() => {
    try {
      const u = new URL(href, "https://samarket.local");
      return {
        pathname: u.pathname.replace(/\/+$/, "") || "/",
        search: u.search.startsWith("?") ? u.search.slice(1) : u.search,
      };
    } catch {
      return { pathname: "", search: "" };
    }
  }, [href]);

  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), MAIN_SHELL_ROUTE_TRANSITION_MS + 80);
    return () => window.clearTimeout(timer);
  }, [href]);

  if (!ready) return <StableMainTabEnterPanel />;

  if (pathname === "/philife") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app">
        <Suspense fallback={null}>
          <PhilifeFeedClientEntry />
        </Suspense>
      </div>
    );
  }

  if (pathname === "/stores") {
    return (
      <div
        className={`delivery-ui ${DeliveryTheme.page} min-h-0`}
        data-stores-layout-profile="stores-hub"
      >
        <StoresHub />
      </div>
    );
  }

  if (pathname === "/community-messenger") {
    const params = new URLSearchParams(search);
    return (
      <Suspense fallback={null}>
        <CommunityMessengerHome
          initialTab={params.get("tab") ?? undefined}
          initialSection={params.get("section") ?? undefined}
          initialFilter={params.get("filter") ?? undefined}
          initialKind={params.get("kind") ?? undefined}
        />
      </Suspense>
    );
  }

  if (pathname === "/mypage" || pathname === "/my") {
    return (
      <Suspense fallback={null}>
        <MyContent />
      </Suspense>
    );
  }

  return <StableMainTabEnterPanel />;
}

function MainBottomNavPendingEnterPanel({ href }: { href: string }) {
  const pathname = useMemo(() => {
    try {
      const u = new URL(href, "https://samarket.local");
      return u.pathname.replace(/\/+$/, "") || "/";
    } catch {
      return "";
    }
  }, [href]);

  if (isMarketMenuIntentPath(pathname)) {
    return <TradeMarketTabPushEnterPanel href={href} />;
  }

  if (
    pathname === "/philife" ||
    pathname === "/stores" ||
    pathname === "/community-messenger" ||
    pathname === "/mypage" ||
    pathname === "/my"
  ) {
    return <DeferredMainTabEnterPanel href={href} />;
  }

  return <div className="min-h-screen bg-sam-app" aria-hidden />;
}

export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  const pathname = usePathname();
  const { isPendingMenuBlockingContent, pendingMenuIntent } = useLatestMenuNavigation();

  /** 메인 메뉴 이동 전체: RSC 대기 중 전면/push 스켈레톤 금지. */
  const pendingShell = null;
  const pendingPushNode = useMemo(() => {
    if (isCommunityMessengerDeepRoutePath(pathname ?? "")) return null;
    if (!isPendingMenuBlockingContent || !pendingMenuIntent) return null;
    if (pendingMenuIntent.source === "trade-primary" || pendingMenuIntent.source === "bottom-nav") {
      return <MainBottomNavPendingEnterPanel href={pendingMenuIntent.href} />;
    }
    return null;
  }, [isPendingMenuBlockingContent, pathname, pendingMenuIntent]);

  return (
    <AppRouteTransition
      contentStretchClass={contentStretchClass}
      overlay={pendingShell}
      pendingPushNode={pendingPushNode}
    >
      {children}
    </AppRouteTransition>
  );
}
