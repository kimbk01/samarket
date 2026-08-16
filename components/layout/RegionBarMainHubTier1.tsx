"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { TradeHeaderComposeButton } from "@/components/trade/TradeHeaderComposeButton";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { MyMypageHeaderActions } from "@/components/my/MyMypageHeaderActions";
import {
  BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY,
  BOTTOM_NAV_TRADE_TAB_LABEL_KEY,
  NAV_DOT_LABEL_KEYS,
} from "@/lib/main-menu/bottom-nav-config";
import { SectionHeader } from "@/components/layout/sector-header";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import {
  resolveMainTabKeepAliveHub,
  type MainTabKeepAliveHubId,
} from "@/lib/layout/resolve-main-surface";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import type { ReactNode } from "react";

function UnifiedTier1Shell({ children }: { children: React.ReactNode }) {
  return (
    <header className="w-full min-w-0 max-w-full shrink-0 overflow-x-hidden sector-header-shell sector-header-shell--embedded">
      {children}
    </header>
  );
}

function resolveMainHubId(pathNoQuery: string): Exclude<MainTabKeepAliveHubId, "delivery"> | null {
  const hub = resolveMainTabKeepAliveHub(pathNoQuery);
  if (hub === "community" || hub === "trade" || hub === "chat" || hub === "mypage") return hub;
  /** `/market/[slug]` etc. — same MAIN HUB as Trade keep-alive */
  if (isTradeFloatingMenuSurface(pathNoQuery)) {
    if (pathNoQuery.startsWith("/mypage/")) return "mypage";
    return "trade";
  }
  return null;
}

function defaultRightSlot(hub: Exclude<MainTabKeepAliveHubId, "delivery">): ReactNode {
  if (hub === "community") {
    return (
      <div className={`${samTier1HeaderIconCluster} community-tier1-header-actions`}>
        <PhilifeHeaderComposeButton />
        <PhilifeHeaderAddressMenuButton />
        <Tier1NotificationAnchor surface="bottom_nav_community" />
      </div>
    );
  }
  if (hub === "trade") {
    return (
      <div className={samTier1HeaderIconCluster}>
        <TradeHeaderComposeButton />
        <Tier1NotificationAnchor surface="bottom_nav_my" />
      </div>
    );
  }
  if (hub === "mypage") {
    return <MyMypageHeaderActions />;
  }
  /** chat — shell effects supply `rightSlot`; empty until mounted */
  return null;
}

function hubTitleKey(hub: Exclude<MainTabKeepAliveHubId, "delivery">) {
  if (hub === "community") return BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY;
  if (hub === "trade") return BOTTOM_NAV_TRADE_TAB_LABEL_KEY;
  if (hub === "chat") return NAV_DOT_LABEL_KEYS.chat;
  return NAV_DOT_LABEL_KEYS.my;
}

/**
 * MAIN HUB HEADER — Community / Trade / Chat / MyPage.
 * SAME geometry · typography · left title · icon cluster · safe-top (via AppStickyHeader).
 * Domain surface only via `[data-dibay-domain]` / sector tokens.
 * Delivery is NOT this component (SPECIAL HEADER).
 */
export function RegionBarMainHubTier1({ pathNoQuery }: { pathNoQuery: string }) {
  const { t } = useI18n();
  const hub = resolveMainHubId(pathNoQuery);
  const extrasRight = useMainTier1ExtrasOptional()?.extras?.tier1?.rightSlot;

  if (hub == null) {
    return null;
  }

  /** Trade: map pin + City · km sits immediately right of 「거래」 (not in right icon cluster). */
  const title: ReactNode =
    hub === "trade" ? (
      <span className="flex min-w-0 max-w-full items-center gap-1.5 whitespace-normal">
        <span className="min-w-0 shrink truncate">{t(hubTitleKey(hub))}</span>
        <TradeHeaderLocationPinButton placement="beside-title" />
      </span>
    ) : (
      t(hubTitleKey(hub))
    );
  const rightSlot = extrasRight ?? defaultRightSlot(hub);

  return (
    <UnifiedTier1Shell>
      <SectionHeader embedded titleAlign="left" title={title} rightSlot={rightSlot} />
    </UnifiedTier1Shell>
  );
}
