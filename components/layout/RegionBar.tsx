"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
  type MobileTopTier1RuleSet,
} from "@/lib/layout/mobile-top-tier1-rules";
import {
  buildMessengerRoomListBackHref,
  shouldForceDirectDeliveryMessengerRoomBack,
} from "@/lib/community-messenger/messenger-entry-origin";
import { getMessengerRoomBackOverride } from "@/lib/community-messenger/room/messenger-room-back-navigation";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { resolveTier1BarLabel } from "@/lib/layout/resolve-tier1-bar-label";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { Tier1ExplorationTitleRow } from "@/components/layout/Tier1ExplorationTitleRow";
import { PhilifeHeaderComposeButton } from "@/components/philife/PhilifeHeaderComposeButton";
import { PhilifeHeaderMessengerButton } from "@/components/philife/PhilifeHeaderMessengerButton";
import { PhilifeHeaderAddressMenuButton } from "@/components/philife/PhilifeHeaderAddressMenuButton";
import { MyHubHeaderActions, MyHubHeaderInfoHubTrigger } from "@/components/my/MyHubHeaderActions";
import { PhilifeHeaderNotificationInbox } from "@/components/philife/PhilifeHeaderNotificationInbox";
import { TradeHeaderComposeButton } from "@/components/trade/TradeHeaderComposeButton";
import {
  BOTTOM_NAV_DELIVERY_TAB_LABEL_KEY,
  BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY,
  BOTTOM_NAV_TRADE_TAB_LABEL_KEY,
} from "@/lib/main-menu/bottom-nav-config";
import { StoresRootTier1HeaderActions } from "@/components/stores/StoresRootTier1HeaderActions";
import type { ReactNode } from "react";

function UnifiedTier1Shell({ children }: { children: ReactNode }) {
  return (
    <header className="w-full min-w-0 max-w-full shrink-0 overflow-x-hidden bg-sam-surface/95 backdrop-blur-[10px]">
      {children}
    </header>
  );
}

/** Main tier-1 chrome: 커뮤니티(`/philife`)·거래 탐색·배달 루트(`/stores`)는 `Tier1ExplorationTitleRow`(지역 한 줄·`/mypage/addresses`). */
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
  const ruleSet = useMemo(
    () => tier1RuleSetProp ?? getMobileTopTier1RuleSet(pathname),
    [tier1RuleSetProp, pathname]
  );
  const tier1Subpage = useMemo(() => resolveMainTier1Subpage(pathNoQuery), [pathNoQuery]);
  const extrasOpt = useMainTier1ExtrasOptional();
  const extras = extrasOpt?.extras ?? null;
  if (!ruleSet.showRegionBar) {
    return null;
  }

  /** Trade home/market and Philife feed share the same tier-1 layout (title, region line, search, settings). */
  const isUnifiedExplorationTier1 =
    (isTradeFloatingMenuSurface(pathNoQuery) &&
      ruleSet.showRegionPicker &&
      !ruleSet.showTradeHubLeading) ||
    pathNoQuery === "/philife";

  if (isUnifiedExplorationTier1) {
    const isPhilifeFeed = pathNoQuery === "/philife";
    const segmentTitle = isPhilifeFeed
      ? t(BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY)
      : t(BOTTOM_NAV_TRADE_TAB_LABEL_KEY);
    const tier1TitleOnly = (
      <h1 className="flex h-full min-h-0 min-w-0 w-full flex-row items-center gap-2 overflow-hidden text-sam-fg">
        <span className="shrink-0 sam-text-page-title leading-none">{segmentTitle}</span>
      </h1>
    );
    return (
      <UnifiedTier1Shell>
        <div
          className={`flex h-[length:var(--sam-header-row-height)] min-h-[length:var(--sam-header-row-height)] min-w-0 items-center gap-0 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
        >
          {isPhilifeFeed ? (
            <>
              <div className="flex h-full w-10 shrink-0 items-center justify-start">
                <MyHubHeaderInfoHubTrigger />
              </div>
              <div className="flex h-full min-h-0 min-w-0 flex-1 items-center overflow-hidden pr-1 text-left ml-[length:1pt]">
                {tier1TitleOnly}
              </div>
              <div className="ml-auto flex h-full w-[160px] shrink-0 flex-none items-center justify-end pl-0 -mr-1">
                <div className="inline-flex h-full shrink-0 items-center gap-0 [&>*+*]:-ml-1">
                  <PhilifeHeaderComposeButton />
                  <PhilifeHeaderNotificationInbox />
                  <PhilifeHeaderMessengerButton />
                  <PhilifeHeaderAddressMenuButton />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-full w-10 shrink-0 items-center justify-start">
                <MyHubHeaderInfoHubTrigger />
              </div>
              <div className="flex h-full min-h-0 min-w-0 flex-1 items-center overflow-hidden pr-1 text-left ml-[length:1pt]">
                {tier1TitleOnly}
              </div>
              <div className="ml-auto flex h-full w-[160px] shrink-0 flex-none items-center justify-end pl-0 -mr-1">
                <div className="inline-flex h-full shrink-0 items-center gap-0 [&>*+*]:-ml-1">
                  <TradeHeaderComposeButton />
                  <PhilifeHeaderNotificationInbox />
                  <PhilifeHeaderMessengerButton />
                </div>
              </div>
            </>
          )}
        </div>
      </UnifiedTier1Shell>
    );
  }

  if (pathNoQuery === "/stores") {
    const segmentTitle = t(BOTTOM_NAV_DELIVERY_TAB_LABEL_KEY);
    return (
      <UnifiedTier1Shell>
        <div
          className={`flex h-[length:var(--sam-header-row-height)] min-h-[length:var(--sam-header-row-height)] min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
        >
          <div className="flex h-full min-h-0 min-w-0 flex-1 items-center overflow-hidden pr-1 text-left">
            <h1 className="flex min-h-0 min-w-0 w-full items-center overflow-hidden text-sam-fg">
              <span className="shrink-0 sam-text-page-title leading-none">{segmentTitle}</span>
            </h1>
          </div>
          <div className="ml-auto flex h-full shrink-0 items-center justify-end pr-0.5">
            <StoresRootTier1HeaderActions />
          </div>
        </div>
      </UnifiedTier1Shell>
    );
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

  const centerNode: ReactNode =
    centerFromExtras != null && typeof centerFromExtras !== "string" ? (
      centerFromExtras
    ) : stringTitle ? (
      <span className="truncate sam-text-page-title">{stringTitle}</span>
    ) : (
      <span className="truncate sam-text-page-title">dibaY</span>
    );

  const right =
    o?.rightSlot != null ? (
      <div className="flex min-w-[44px] shrink-0 items-center justify-end self-stretch">{o.rightSlot}</div>
    ) : showHub ? (
      <div className="flex shrink-0 items-center self-stretch">
        <MyHubHeaderActions />
      </div>
    ) : (
      <div className="h-9 w-9 shrink-0 self-center" aria-hidden />
    );

  const alignTitleStart = o?.alignTier1TitleStart === true;
  const titleColClass = alignTitleStart
    ? "flex min-h-0 min-w-0 flex-1 flex-col justify-center self-stretch overflow-hidden pl-0 pr-1 text-left"
    : "flex min-h-0 min-w-0 flex-1 flex-col justify-center self-stretch overflow-hidden px-1 text-center";
  const h1Class = alignTitleStart
    ? "flex min-w-0 w-full flex-col items-start justify-center overflow-hidden text-sam-fg"
    : "flex min-w-0 w-full flex-col items-center justify-center overflow-hidden text-sam-fg";
  const tier1RowGapClass = alignTitleStart ? "gap-0.5" : "gap-2";

  return (
    <UnifiedTier1Shell>
      <div
        className={`flex h-[length:var(--sam-header-row-height)] min-h-[length:var(--sam-header-row-height)] min-w-0 items-center ${tier1RowGapClass} overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
      >
        <div
          className={
            o?.leftSlot != null
              ? "flex w-auto min-w-[44px] max-w-[min(200px,50vw)] shrink-0 items-center justify-start self-stretch"
              : "flex w-[44px] shrink-0 items-center justify-start self-stretch"
          }
        >
          {o?.leftSlot != null ? (
            o.leftSlot
          ) : hideBack ? (
            <div className="h-9 w-9 shrink-0" aria-hidden />
          ) : (
            <AppBackButton preferHistoryBack={preferHistoryBack} backHref={backHref} ariaLabel={ariaLabel} />
          )}
        </div>
        <div className={titleColClass}>
          <h1 className={h1Class}>
            {centerNode}
            {subtitle ? (
              subtitleHref ? (
                <Link
                  href={subtitleHref}
                  className="mt-0.5 block truncate sam-text-xxs leading-tight text-sam-muted hover:text-sam-fg hover:underline"
                >
                  {subtitle}
                </Link>
              ) : (
                <p className="truncate sam-text-xxs leading-tight text-sam-muted">{subtitle}</p>
              )
            ) : null}
          </h1>
        </div>
        {right}
      </div>
    </UnifiedTier1Shell>
  );
}
