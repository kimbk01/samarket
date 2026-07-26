"use client";

import { Suspense, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { CommunityHomeSurface } from "@/components/community/CommunityHomeSurface";
import { TradeListPageMountProbe } from "@/components/home/TradeListPageMountProbe";
import { MarketContent } from "@/app/(main)/market/MarketContent";
import { StoresHub } from "@/components/stores/StoresHub";
import { StoresDeliveryLayoutShell } from "@/components/delivery/navigation/StoresDeliveryLayoutShell";
import { MessengerHubRouteGate } from "@/components/community-messenger/MessengerHubRouteGate";
import { MyContent } from "@/app/(main)/my/MyContent";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import {
  resolveMainTabKeepAliveHub,
  type MainTabKeepAliveHubId,
} from "@/lib/layout/resolve-main-surface";

type Props = {
  children: ReactNode;
};

/** Survives KeepAlive React remount — visited hubs stay in the set for this JS realm. */
const visitedMainTabHubs = new Set<MainTabKeepAliveHubId>();

function pathFromHref(href: string | null | undefined): string {
  const raw = (href ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://samarket.local");
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const q = raw.indexOf("?");
    const path = (q >= 0 ? raw.slice(0, q) : raw).trim();
    return path.replace(/\/+$/, "") || "/";
  }
}

function HubSlot({
  hub,
  active,
  children,
}: {
  hub: MainTabKeepAliveHubId;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-main-tab-surface={hub}
      data-main-tab-surface-active={active ? "1" : "0"}
      className={
        active
          ? "flex min-h-0 min-w-0 flex-1 flex-col"
          : "hidden"
      }
      // Inactive hub stays mounted (DOM identity) but must not receive input.
      inert={!active ? true : undefined}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

function MessengerKeepAliveSurface() {
  const searchParams = useSearchParams();
  return (
    <Suspense fallback={null}>
      <MessengerHubRouteGate
        initialTab={searchParams.get("tab") ?? undefined}
        initialSection={searchParams.get("section") ?? undefined}
        initialFilter={searchParams.get("filter") ?? undefined}
        initialKind={searchParams.get("kind") ?? undefined}
      />
    </Suspense>
  );
}

/**
 * CONTRACT — Single Surface Authority for bottom tabs.
 *
 * DO NOT: InstantMainTabEnterPanel / dual-panel temporary Feed·List entry.
 * DO NOT: remount hub Surface on route push commit.
 *
 * Cold Boot + Warm Tab: keep-alive mounts the active hub Surface (SSR-safe).
 * Route page children for hub paths are suppressed so pathname commit cannot
 * create a second Feed instance.
 */
export function MainTabSurfaceKeepAlive({ children }: Props) {
  const pathname = usePathname();
  const { pendingMenuIntent } = useLatestMenuNavigation();

  const visualPath = useMemo(() => {
    if (
      pendingMenuIntent &&
      (pendingMenuIntent.source === "bottom-nav" || pendingMenuIntent.source === "trade-primary")
    ) {
      return pathFromHref(pendingMenuIntent.href) || pendingMenuIntent.pathname || pathname || "";
    }
    return pathname ?? "";
  }, [pendingMenuIntent, pathname]);

  const activeHub = resolveMainTabKeepAliveHub(visualPath);
  const routeHub = resolveMainTabKeepAliveHub(pathname);

  const [mountedHubs, setMountedHubs] = useState<Set<MainTabKeepAliveHubId>>(() => {
    const h = resolveMainTabKeepAliveHub(pathname);
    if (h) visitedMainTabHubs.add(h);
    return new Set(visitedMainTabHubs);
  });

  useLayoutEffect(() => {
    if (!activeHub) return;
    visitedMainTabHubs.add(activeHub);
    setMountedHubs((prev) => {
      if (prev.has(activeHub) && prev.size === visitedMainTabHubs.size) return prev;
      return new Set(visitedMainTabHubs);
    });
  }, [activeHub]);

  return (
    <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-main-tab-surface-host="1">
      {mountedHubs.has("community") ? (
        <HubSlot hub="community" active={activeHub === "community"}>
          <CommunityHomeSurface />
        </HubSlot>
      ) : null}
      {mountedHubs.has("trade") ? (
        <HubSlot hub="trade" active={activeHub === "trade"}>
          <TradeListPageMountProbe />
          <MarketContent clientFeedInstantBoot />
        </HubSlot>
      ) : null}
      {mountedHubs.has("delivery") ? (
        <HubSlot hub="delivery" active={activeHub === "delivery"}>
          <StoresDeliveryLayoutShell>
            <div
              className={`delivery-ui ${DeliveryTheme.page} min-h-0`}
              data-stores-layout-profile="stores-hub"
            >
              <StoresHub />
            </div>
          </StoresDeliveryLayoutShell>
        </HubSlot>
      ) : null}
      {mountedHubs.has("chat") ? (
        <HubSlot hub="chat" active={activeHub === "chat"}>
          <MessengerKeepAliveSurface />
        </HubSlot>
      ) : null}
      {mountedHubs.has("mypage") ? (
        <HubSlot hub="mypage" active={activeHub === "mypage"}>
          <Suspense fallback={null}>
            <MyContent />
          </Suspense>
        </HubSlot>
      ) : null}
      {/* Detail / non-hub: route children (may include AppRouteTransition). Hub paths: keep-alive only. */}
      {routeHub == null ? children : null}
    </div>
  );
}
