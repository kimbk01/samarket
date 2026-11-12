"use client";

import { type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1TitleAreaButton, Tier1TitleWithArea } from "@/components/layout/Tier1TitleAreaButton";
import { TradeHeaderLocationPinButton } from "@/components/trade/TradeHeaderLocationPinButton";
import { parseCommunityNavFromSearchParams } from "@/lib/community/community-nav";
import { moimRoutes } from "@/lib/moim/moim-client-api";
import { requestOpenCommunityAreaSheet, useCommunityAreaTitle } from "@/lib/community/community-area-title-store";
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

function UnifiedTier1Shell({ children, noLeftSlot = false }: { children: React.ReactNode; noLeftSlot?: boolean }) {
  return (
    <header
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden sector-header-shell sector-header-shell--embedded${
        noLeftSlot ? " sector-header--no-left-slot" : ""
      }`}
    >
      {children}
    </header>
  );
}

/** 1단 허브 머리글을 쓰는 화면 — 하단 탭 허브 + 모임 홈(커뮤니티 안 세 번째 화면, Owner 「3판대로 구현」 2026-11-12) */
type MainHubTier1Id = Exclude<MainTabKeepAliveHubId, "delivery"> | "moim";

function resolveMainHubId(pathNoQuery: string): MainHubTier1Id | null {
  if (pathNoQuery === "/moim") return "moim";
  const hub = resolveMainTabKeepAliveHub(pathNoQuery);
  if (hub === "community" || hub === "trade" || hub === "chat" || hub === "mypage") return hub;
  /** `/market/[slug]` etc. — same MAIN HUB as Trade keep-alive */
  if (isTradeFloatingMenuSurface(pathNoQuery)) {
    if (pathNoQuery.startsWith("/mypage/")) return "mypage";
    return "trade";
  }
  return null;
}

function defaultRightSlot(hub: MainHubTier1Id): ReactNode {
  if (hub === "moim") {
    return <MoimHeaderRightActions />;
  }
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

function hubTitleKey(hub: MainHubTier1Id) {
  if (hub === "moim") return "tier1_moim" as const;
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

  /**
   * 정보교환·거래 1단 = 제목 + 「· 동네 ⌄」 (Owner 「3판대로 구현」 2026-11-12, 시안 N3 · 설계 §2-2).
   * 동네 이름이 길어도 들어가게 1단 왼쪽 빈칸(40px)을 없앤다(`sector-header--no-left-slot`, 시·군 1,872개 중 긴 이름 50개 실측).
   * 「정보교환 · 거래」 전환 탭은 머리글 3단 `CommunityTradeSwitchRow`.
   */
  const areaHub = hub === "trade" || hub === "community";
  const title: ReactNode = areaHub ? (
    <Tier1TitleWithArea
      title={t(hub === "community" ? "nav_community_switch_info" : "nav_bottom_trade")}
      area={hub === "community" ? <CommunityTier1AreaButton /> : <TradeHeaderLocationPinButton placement="title" />}
    />
  ) : (
    t(hubTitleKey(hub))
  );
  const rightSlot = extrasRight ?? defaultRightSlot(hub);

  return (
    <UnifiedTier1Shell noLeftSlot={areaHub || hub === "moim"}>
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
      {/* 글쓰기 = 목록 오른쪽 아래 떠 있는 버튼(`PhilifeComposeFab`) · 주소 = 제목 뒤 「· 동네 ⌄」 시트 (Owner 「3판대로 구현」 2026-11-12) */}
      <Tier1NotificationAnchor surface="bottom_nav_community" />
    </div>
  );
}

/** 모임 홈 1단 오른쪽 — 모임 찾기(본문 검색칸을 옮김) · 알림 (Owner 「3판대로 구현」 2026-11-12) */
function MoimHeaderRightActions() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className={`${samTier1HeaderIconCluster} gap-2`}>
      <button
        type="button"
        data-moim-search-open="true"
        className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} rounded-ui-rect bg-sam-surface active:scale-[0.98] active:opacity-90`}
        aria-label={t("moim_search_open_aria")}
        onClick={() => router.push(moimRoutes.search)}
      >
        <Search className="h-4 w-4 text-sam-fg" aria-hidden />
      </button>
      <Tier1NotificationAnchor surface="bottom_nav_community" />
    </div>
  );
}

/** 정보교환 1단 「· 동네 ⌄」 — 값은 피드가 알려 주고(`community-area-title-store`), 누르면 피드의 「보는 동네」 시트를 연다 */
function CommunityTier1AreaButton() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const area = useCommunityAreaTitle();
  /** 피드가 붙기 전 첫 화면은 주소(`nav=local`)로 판단 */
  const active = area.active ?? parseCommunityNavFromSearchParams(searchParams).kind === "local";
  const label = active ? area.label || t("community_feed_mode_local") : t("community_area_all");
  return (
    <Tier1TitleAreaButton
      label={label}
      active={active}
      ariaLabel={t("community_area_title_aria", { label })}
      onClick={requestOpenCommunityAreaSheet}
    />
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
