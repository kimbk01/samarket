"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
  type MobileTopTier1RuleSet,
} from "@/lib/layout/mobile-top-tier1-rules";
import { resolveMainTabKeepAliveHub } from "@/lib/layout/resolve-main-surface";
import {
  buildMessengerRoomListBackHref,
  shouldForceDirectDeliveryMessengerRoomBack,
} from "@/lib/community-messenger/messenger-entry-origin";
import { getMessengerRoomBackOverride } from "@/lib/community-messenger/room/messenger-room-back-navigation";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { resolveTier1BarLabel } from "@/lib/layout/resolve-tier1-bar-label";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import { DetailHeader } from "@/components/layout/sector-header";
import { StoresBrowseHeaderChrome } from "@/components/stores/browse/StoresBrowseHeaderChrome";
import { StoresHomeHeaderChrome } from "@/components/stores/home/hub/StoresHomeHeaderChrome";
import { RegionBarMainHubTier1 } from "@/components/layout/RegionBarMainHubTier1";
import {
  DELIVERY_CONSUMER_HEADER_BAR_CLASS,
  isDeliveryConsumerPath,
  isStoresBrowseHeaderPath,
} from "@/lib/design/delivery-chrome";
import { APP_TIER1_HEADER_BAR_CLASS } from "@/lib/layout/app-tier1-header";
import { isStoreOwnerAdminReturnTo } from "@/lib/business/owner-hub-path";
import { isCustomerCommerceHubPath, isCustomerGiftCommercePath } from "@/lib/delivery/customer/commerce-hub-nav";
import type { ReactNode } from "react";

/** Main tier-1 chrome router — MAIN HUB / Delivery special / DetailHeader subpages. */
export function RegionBar({
  /** When `AppStickyHeader` already computed rules, pass to avoid duplicate `getMobileTopTier1RuleSet` calls. */
  tier1RuleSet: tier1RuleSetProp,
}: {
  tier1RuleSet?: MobileTopTier1RuleSet;
}) {
  const { tt, t, safeT } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathNoQuery = normalizeAppPathnameForTier1(pathname);
  const isMessengerSplit = useIsMessengerSplitViewport();
  /** ≥768 메신저 전 표면 — SplitTopBar SSOT (허브·trade/delivery·room 포함). RegionBar 이중 헤더 금지. */
  const isMessengerSplitSurface =
    isMessengerSplit &&
    (pathNoQuery === "/community-messenger" || pathNoQuery.startsWith("/community-messenger/"));
  const ruleSet = useMemo(
    () => tier1RuleSetProp ?? getMobileTopTier1RuleSet(pathname),
    [tier1RuleSetProp, pathname]
  );
  const tier1Subpage = useMemo(() => {
    const q = searchParams?.toString();
    return resolveMainTier1Subpage(pathNoQuery, q ? `?${q}` : "");
  }, [pathNoQuery, searchParams]);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = extrasOpt?.extras ?? null;
  if (!ruleSet.showRegionBar || isMessengerSplitSurface) {
    return null;
  }

  /** 매장 입점·운영 복귀(`returnTo`) — `StoresGreenFixedHeaderChrome` 로컬 헤더와 중복 방지 */
  const returnToRaw = searchParams?.get("returnTo") ?? "";
  if (
    (pathNoQuery === "/mypage/addresses" || pathNoQuery.startsWith("/mypage/addresses/")) &&
    isStoreOwnerAdminReturnTo(returnToRaw)
  ) {
    return null;
  }

  /**
   * MAIN HUB HEADER — Community / Trade / Chat / MyPage (keep-alive hubs).
   * Delivery stays SPECIAL below. Trade floating menu surfaces that are not exact `/market`
   * still use MAIN HUB when exploration rules match.
   */
  const keepAliveHub = resolveMainTabKeepAliveHub(pathNoQuery);
  const isTradeExplorationSurface =
    isTradeFloatingMenuSurface(pathNoQuery) &&
    ruleSet.showRegionPicker &&
    !ruleSet.showTradeHubLeading;
  if (
    (keepAliveHub === "community" ||
      keepAliveHub === "trade" ||
      keepAliveHub === "chat" ||
      keepAliveHub === "mypage") ||
    isTradeExplorationSurface
  ) {
    return <RegionBarMainHubTier1 pathNoQuery={pathNoQuery} />;
  }

  if (pathNoQuery === "/stores" || keepAliveHub === "delivery") {
    return <StoresHomeHeaderChrome />;
  }
  if (isStoresBrowseHeaderPath(pathNoQuery)) {
    return <StoresBrowseHeaderChrome />;
  }
  if (pathNoQuery === "/stores/search" || pathNoQuery.startsWith("/stores/search/")) {
    return <StoresHomeHeaderChrome />;
  }

  const base = tier1Subpage;
  if (base == null) {
    return null;
  }

  const o = extras?.tier1;
  const hideBack = o?.hideBack ?? base.hideBack ?? false;
  const isMessengerRoom = /^\/community-messenger\/rooms\/[^/]+$/.test(pathNoQuery);
  const messengerRoomId = isMessengerRoom
    ? decodeURIComponent(pathNoQuery.split("/").pop() ?? "").trim()
    : "";
  const messengerRoomBackOverride =
    messengerRoomId ? getMessengerRoomBackOverride(messengerRoomId) : null;
  /**
   * 메신저 채팅방 뒤로가기:
   * - 배달 주문(`cm_list=delivery`)·override 는 **메신저 목록을 거치지 않고** `backHref` 로 직행.
   * - 그 외 방은 히스토리 back 우선(`runHistoryBackWithFallback`).
   */
  const backHref = isMessengerRoom
    ? (messengerRoomBackOverride?.href ?? buildMessengerRoomListBackHref(searchParams))
    : o?.backHref ?? base.backHref;
  const deliveryRoomForceDirect =
    isMessengerRoom && shouldForceDirectDeliveryMessengerRoomBack(searchParams);
  const preferHistoryBack =
    isMessengerRoom ?
      messengerRoomBackOverride || deliveryRoomForceDirect ? false
      : true
    : o?.preferHistoryBack ?? base.preferHistoryBack;
  const ariaLabel = resolveTier1BarLabel(t, tt, o?.ariaLabel ?? base.ariaLabel) ?? safeT("tier1_back");
  const subtitleRaw = o?.subtitle ?? base.subtitle;
  const subtitle = resolveTier1BarLabel(t, tt, subtitleRaw);
  const subtitleHref = o?.subtitleHref ?? base.subtitleHref;
  const showHub = o?.showHubQuickActions ?? base.showHubQuickActions;

  const centerFromExtras = o?.title != null ? o.title : null;
  const titleTextFromExtras = o?.titleText;
  const rawStringTitle =
    (typeof centerFromExtras === "string" ? resolveTier1BarLabel(t, tt, centerFromExtras) : null) ??
    (titleTextFromExtras ? resolveTier1BarLabel(t, tt, titleTextFromExtras) : null) ??
    resolveTier1BarLabel(t, tt, base.titleText);
  const stringTitle = rawStringTitle?.trim() ? rawStringTitle : undefined;

  /**
   * Title coverage contract: never hide missing registration with brand fallback.
   * Empty → user-visible unavailable copy (and coverage tests must keep chrome routes at 0 missing).
   */
  const centerNode: ReactNode =
    centerFromExtras != null && typeof centerFromExtras !== "string" ? (
      centerFromExtras
    ) : stringTitle ? (
      stringTitle
    ) : (
      safeT("common_content_unavailable", {
        fallbackKo: "내용을 표시할 수 없습니다",
        fallbackEn: "Content unavailable",
      })
    );

  const trailing =
    o?.rightSlot != null ? o.rightSlot : showHub ? <MyHubHeaderActions /> : null;

  const barClass = isDeliveryConsumerPath(pathNoQuery)
    ? `delivery-ui ${DELIVERY_CONSUMER_HEADER_BAR_CLASS}`
    : APP_TIER1_HEADER_BAR_CLASS;
  const isCommerceHub = isCustomerCommerceHubPath(pathNoQuery);
  const isGiftCommerce = isCustomerGiftCommercePath(pathNoQuery);

  return (
    <header
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden ${barClass}`}
      data-commerce-hub-tier1={isCommerceHub ? "1" : undefined}
      data-customer-gift-commerce-tier1={isGiftCommerce ? "1" : undefined}
    >
      <DetailHeader
        embedded
        title={centerNode}
        subtitle={subtitle}
        subtitleHref={subtitleHref}
        showBack={!hideBack}
        leftSlot={o?.leftSlot ?? undefined}
        backHref={backHref}
        preferHistoryBack={preferHistoryBack}
        backAriaLabel={ariaLabel}
        rightSlot={trailing}
      />
    </header>
  );
}
