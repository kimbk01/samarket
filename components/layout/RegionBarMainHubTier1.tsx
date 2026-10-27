"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
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
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS } from "@/lib/ui/tier1-header-icon";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { openGlobalSearchFromHere } from "@/lib/search/global/global-search-navigation-ssot";
import { buildTradeSearchEntryHref } from "@/lib/trade/search/trade-search-paths";

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
    return <CommunityHeaderRightActions />;
  }
  if (hub === "trade") {
    return <TradeHeaderRightActions />;
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

  /** Trade HOME identity is Marketplace. Location lives in the entry chrome under this row. */
  const title: ReactNode =
    hub === "trade" ? t("marketplace_home_title") : t(hubTitleKey(hub));
  const rightSlot = extrasRight ?? defaultRightSlot(hub);

  return (
    <UnifiedTier1Shell>
      <SectionHeader embedded titleAlign="left" title={title} rightSlot={rightSlot} />
    </UnifiedTier1Shell>
  );
}

function CommunityHeaderRightActions() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className={`${samTier1HeaderIconCluster} community-tier1-header-actions`}>
      <button
        type="button"
        data-global-search-open="community"
        className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
        aria-label={t("common_search")}
        onClick={() => openGlobalSearchFromHere(router, { domain: "community" })}
      >
        <Search className="h-4 w-4 text-sam-fg" aria-hidden />
      </button>
      <PhilifeHeaderComposeButton />
      <PhilifeHeaderAddressMenuButton />
      <Tier1NotificationAnchor surface="bottom_nav_community" />
    </div>
  );
}

function TradeHeaderRightActions() {
  const { t } = useI18n();
  const router = useRouter();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();

  /** 재설계 4-1: 거래 돋보기 = 거래 전용 찾기(지금 목록 조건 유지). 다른 도메인 돋보기는 전역 검색 그대로. */
  const goToTradeSearch = () => {
    const onList = typeof window !== "undefined" && window.location.pathname === "/market";
    const href = buildTradeSearchEntryHref(onList ? window.location.search : "");
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
  };

  /** 거래 E (Owner 2026-10-28, Marketplace 형태): 헤더에 「판매하기」를 두지 않는다 — 판매는 탭 줄 「판매」 탭 */
  return (
    <div className={`${samTier1HeaderIconCluster} gap-2`}>
      <button
        type="button"
        data-trade-search-open="true"
        className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
        aria-label={t("trade_search_placeholder")}
        onClick={goToTradeSearch}
      >
        <Search className="h-4 w-4 text-sam-fg" aria-hidden />
      </button>
      <Tier1NotificationAnchor surface="bottom_nav_my" />
    </div>
  );
}
