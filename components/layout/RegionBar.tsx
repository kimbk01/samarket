"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
  type MobileTopTier1RuleSet,
} from "@/lib/layout/mobile-top-tier1-rules";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { Tier1ExplorationTitleRow } from "@/components/layout/Tier1ExplorationTitleRow";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import {
  BOTTOM_NAV_PHILIFE_TAB_LABEL,
  BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY,
  BOTTOM_NAV_TRADE_TAB_LABEL,
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
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
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
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
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

function UnifiedTier1Shell({
  embedded,
  children,
}: {
  embedded?: boolean;
  children: ReactNode;
}) {
  return (
    <header
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden bg-[var(--sub-bg)] ${embedded ? "" : "border-b border-ig-border"}`}
    >
      {children}
    </header>
  );
}

/** 메인 1단 UI — 단일 구현체. `Tier1ExplorationTitleRow`·서브페이지·매장 루트를 한 스타일(h-12)로 맞춘다. */
export function RegionBar({
  embedded,
  /** `AppStickyHeader` 등 상위에서 이미 `getMobileTopTier1RuleSet` 을 계산한 경우 전달 — 중복 호출 방지 */
  tier1RuleSet: tier1RuleSetProp,
}: {
  embedded?: boolean;
  tier1RuleSet?: MobileTopTier1RuleSet;
}) {
  const { tt, t } = useI18n();
  const pathname = usePathname();
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

  /** 거래 홈·마켓 / 필라이프 피드 — 동일 1단(좌 여백 · 탭라벨·동네 · 알림·설정), 하단 탭으로 화면 전환 */
  const isUnifiedExplorationTier1 =
    (isTradeFloatingMenuSurface(pathNoQuery) &&
      ruleSet.showRegionPicker &&
      !ruleSet.showTradeHubLeading) ||
    pathNoQuery === "/philife";

  if (isUnifiedExplorationTier1) {
    const segmentTitle =
      pathNoQuery === "/philife" ? t(BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY) : t(BOTTOM_NAV_TRADE_TAB_LABEL_KEY);
    return (
      <UnifiedTier1Shell embedded={embedded}>
        <div className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
          <div className="flex w-[44px] shrink-0 justify-start" aria-hidden>
            <div className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
            <h1 className="flex min-w-0 w-full items-center justify-center overflow-hidden text-foreground">
              <Tier1ExplorationTitleRow segmentTitle={segmentTitle} />
            </h1>
          </div>
          <MyHubHeaderActions />
        </div>
      </UnifiedTier1Shell>
    );
  }

  if (pathNoQuery === "/stores") {
    return (
      <UnifiedTier1Shell embedded={embedded}>
        <div className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
          <div className="flex w-[44px] shrink-0 justify-start">
            <AppBackButton preferHistoryBack backHref="/home" ariaLabel={t("tier1_back")} />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
            <h1 className="overflow-hidden text-foreground">
              <span className="block truncate text-[17px] font-semibold">{t("common_delivery")}</span>
            </h1>
          </div>
          <StoresRootTier1Right />
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
  const backHref = o?.backHref ?? base.backHref;
  const preferHistoryBack = o?.preferHistoryBack ?? base.preferHistoryBack;
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
      <span className="truncate text-[17px] font-semibold">{stringTitle}</span>
    ) : (
      <span className="truncate text-[17px] font-semibold">SAMarket</span>
    );

  const right =
    o?.rightSlot != null ? (
      <div className="flex min-w-[44px] shrink-0 items-center justify-end">{o.rightSlot}</div>
    ) : showHub ? (
      <MyHubHeaderActions />
    ) : (
      <div className="h-9 w-9 shrink-0" aria-hidden />
    );

  return (
    <UnifiedTier1Shell embedded={embedded}>
      <div className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
        <div
          className={
            o?.leftSlot != null
              ? "flex w-auto min-w-[44px] max-w-[min(200px,50vw)] shrink-0 items-center justify-start"
              : "flex w-[44px] shrink-0 justify-start"
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
            />
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
          <h1 className="flex min-w-0 w-full flex-col items-center justify-center overflow-hidden text-foreground">
            {centerNode}
            {subtitle ? (
              subtitleHref ? (
                <Link
                  href={subtitleHref}
                  className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--text-muted)] hover:text-foreground hover:underline"
                >
                  {subtitle}
                </Link>
              ) : (
                <p className="truncate text-[11px] leading-tight text-[var(--text-muted)]">{subtitle}</p>
              )
            ) : null}
          </h1>
        </div>
        {right}
      </div>
    </UnifiedTier1Shell>
  );
}
