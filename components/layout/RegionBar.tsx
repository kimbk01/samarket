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
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
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
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import type { ReactNode } from "react";

function StoresRootTier1Right() {
  const { t } = useI18n();
  const commerceCart = useStoreCommerceCartOptional();
  const cartLineKindCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Link
        href="/search"
        className="sam-header-action h-10 w-10 text-sam-fg"
        aria-label={t("nav_search_aria")}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </Link>
      <Link
        href={cartHref}
        className="sam-header-action relative h-10 w-10 shrink-0 text-sam-fg"
        aria-label={cartLineKindCount > 0 ? t("nav_cart_aria") : t("common_delivery")}
      >
        <StoreCommerceCartStrokeIcon className="h-5 w-5" />
        {cartLineKindCount > 0 ? (
          <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
            {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

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
  const { tt, t } = useI18n();
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
    return (
      <UnifiedTier1Shell>
        <div
          className={`flex h-[length:var(--sam-header-row-height)] min-h-[length:var(--sam-header-row-height)] min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
        >
          <div className="flex w-[44px] shrink-0 items-center justify-start self-stretch">
            <AppBackButton preferHistoryBack backHref="/philife" ariaLabel={t("tier1_back")} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 items-center self-stretch overflow-hidden px-1 text-center">
            <h1 className="flex min-h-0 min-w-0 w-full items-center justify-center overflow-hidden text-sam-fg">
              <Tier1ExplorationTitleRow segmentTitle={t(BOTTOM_NAV_DELIVERY_TAB_LABEL_KEY)} />
            </h1>
          </div>
          <div className="ml-auto flex h-full min-w-0 max-w-[200px] shrink-0 items-center justify-end gap-0.5 pr-0.5">
            <PhilifeHeaderMessengerButton />
            <StoresRootTier1Right />
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
  /**
   * 메신저 채팅방 뒤로가기: 방 URL 의 `cm_list`·`from` 으로 목록을 확정
   * (거래 목록 / 배달 목록 / 인박스 전체) — 3→2→1 스택이 히스토리와 무관하게 유지.
   * `preferHistoryBack: false` 로 고정 `href` + View Transition(`room-back`).
   */
  const backHref = isMessengerRoom
    ? buildMessengerRoomListBackHref(searchParams)
    : o?.backHref ?? base.backHref;
  const preferHistoryBack = isMessengerRoom ? false : o?.preferHistoryBack ?? base.preferHistoryBack;
  const messengerNavIntent =
    o?.messengerNavIntent ?? (isMessengerRoom ? ("room-back" as const) : undefined);
  const ariaLabel = tt(o?.ariaLabel ?? base.ariaLabel);
  const subtitleRaw = o?.subtitle ?? base.subtitle;
  const subtitle = subtitleRaw ? tt(subtitleRaw) : undefined;
  const subtitleHref = o?.subtitleHref ?? base.subtitleHref;
  const showHub = o?.showHubQuickActions ?? base.showHubQuickActions;

  const centerFromExtras = o?.title != null ? o.title : null;
  const titleTextFromExtras = o?.titleText;
  const rawStringTitle =
    (typeof centerFromExtras === "string" ? tt(centerFromExtras) : null) ??
    (titleTextFromExtras ? tt(titleTextFromExtras) : null) ??
    tt(base.titleText);
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
            <AppBackButton
              preferHistoryBack={preferHistoryBack}
              backHref={backHref}
              ariaLabel={ariaLabel}
              messengerNavIntent={messengerNavIntent}
            />
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
