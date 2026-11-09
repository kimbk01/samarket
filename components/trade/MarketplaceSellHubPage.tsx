"use client";

import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  clearSellHubOverview,
  getSellHubOverviewState,
  loadSellHubOverview,
  seedSellHubOverview,
  subscribeSellHubOverview,
} from "@/lib/trade/sell-hub-overview-client";
import { Sam } from "@/lib/ui/sam-component-classes";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import {
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

const PRODUCTS_HREF = "/mypage/products";
const MESSAGES_HREF = TRADE_CHAT_SURFACE.messengerListHref;
/** 거래 E: 판매 탭 칩 「알림」 = 알림 화면의 거래 탭(`MyNotificationsView` `?tab=trade`) */
const ALERTS_HREF = "/notifications?tab=trade";

/** 숫자 칸 — 로딩 중 스켈레톤(내정보 값 자리와 같은 모양), 실패면 「—」, 값이면 숫자 */
function SellHubOverviewValue({ loading, value }: { loading: boolean; value: number | null }) {
  if (loading) {
    return (
      <span
        aria-hidden
        data-sell-hub-value-loading="1"
        className="block h-5 w-10 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse"
      />
    );
  }
  return <>{value === null ? "—" : `${value}`}</>;
}

function MarketplaceSellHubContent() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const writeCtx = useWriteCategory();
  /** GROUP 2-B: 첫 그림 = 스냅샷 값 또는 스켈레톤, 「—」는 조회 실패일 때만 (`lib/trade/sell-hub-overview-client.ts`) */
  const membership = useClientMembershipState("trade-sell-hub");
  const viewerId =
    (membership.status === "member" ? membership.profile.id : getCurrentUser()?.id)?.trim() ?? "";
  if (viewerId) seedSellHubOverview(viewerId);
  const overview = useSyncExternalStore(subscribeSellHubOverview, getSellHubOverviewState, () => null);
  const current = overview && overview.viewerId === viewerId ? overview : null;
  const loading = !current || (current.loading && current.values === null);
  const activeListingCount = current?.values?.activeListingCount ?? null;
  const openChatCount = current?.values?.openChatCount ?? null;
  const performance = current?.values?.performance ?? null;

  useEffect(() => {
    if (!viewerId) return;
    const s = getSellHubOverviewState();
    if (s && s.viewerId !== viewerId) clearSellHubOverview();
    void loadSellHubOverview(viewerId);
  }, [viewerId]);

  const go = (href: string) => {
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
  };

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  };

  const listingsPill = safeT("marketplace_seller_hub_pill_listings");
  const messagesPill = safeT("marketplace_seller_hub_pill_messages");

  return (
    <div className={`min-w-0 pb-24 ${APP_MAIN_GUTTER_X_CLASS}`}>
      <button
        type="button"
        className={`${Sam.btn.primaryCombo} ${Sam.btn.block} mt-1 flex items-center justify-center gap-2 py-3.5`}
        onClick={openWrite}
      >
        <TradeSellCtaContent />
      </button>

      <section className="mt-8" aria-labelledby="seller-hub-overview-heading">
        <h2 id="seller-hub-overview-heading" className="sam-text-body-secondary font-semibold text-sam-fg">
          {safeT("marketplace_seller_hub_overview")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => go(`${PRODUCTS_HREF}?filter=active`)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left active:bg-sam-surface-muted"
          >
            <p className="sam-text-helper text-sam-muted">
              {safeT("marketplace_seller_hub_overview_active")}
            </p>
            <p className="mt-1 sam-text-body font-semibold text-sam-fg">
              <SellHubOverviewValue loading={loading} value={activeListingCount} />
            </p>
          </button>
          <button
            type="button"
            onClick={() => go(MESSAGES_HREF)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left active:bg-sam-surface-muted"
          >
            <p className="sam-text-helper text-sam-muted">
              {safeT("marketplace_seller_hub_overview_chats")}
            </p>
            <p className="mt-1 sam-text-body font-semibold text-sam-fg">
              <SellHubOverviewValue loading={loading} value={openChatCount} />
            </p>
          </button>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="seller-hub-performance-heading">
        <h2 id="seller-hub-performance-heading" className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("marketplace_seller_hub_performance")}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2" data-seller-hub-performance="1">
          {(
            [
              ["views", t("marketplace_seller_hub_performance_views")],
              ["favorites", t("marketplace_seller_hub_performance_favorites")],
              ["reports", t("marketplace_seller_hub_performance_reports")],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              data-seller-hub-performance-item={key}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3"
            >
              <p className="sam-text-helper text-sam-muted">{label}</p>
              <p className="mt-1 sam-text-body font-semibold text-sam-fg">
                <SellHubOverviewValue loading={loading} value={performance === null ? null : performance[key]} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8">
        <button
          type="button"
          onClick={() => go(PRODUCTS_HREF)}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} py-3`}
        >
          {safeT("marketplace_seller_cta_manage_listings")}
        </button>
      </div>

      <div className="mt-10 border-t border-sam-border pt-4 text-center">
        <Link
          href="/mypage"
          onClick={(e) => {
            if (!guardBeforeNavigate("/mypage")) e.preventDefault();
          }}
          className="sam-text-body-secondary font-medium text-sam-muted underline-offset-2 hover:text-sam-fg hover:underline"
        >
          {t("nav_bottom_my")}
        </Link>
      </div>
    </div>
  );
}

function MarketplaceSellHubPills() {
  const { safeT } = useI18n();
  const pathname = usePathname() ?? "";
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const listingsPill = safeT("marketplace_seller_hub_pill_listings");
  const messagesPill = safeT("marketplace_seller_hub_pill_messages");
  const alertsPill = safeT("marketplace_seller_hub_pill_alerts");
  const onListings = pathname.startsWith(PRODUCTS_HREF);
  const onMessages = pathname.startsWith("/community-messenger/trade-chats");
  const onAlerts = pathname.startsWith("/notifications");

  return (
    <DibaySecondaryTabRow
      bordered
      navRole="secondary"
      trackAriaLabel={safeT("marketplace_seller_hub_pill_nav")}
    >
      <Link
        href={PRODUCTS_HREF}
        prefetch
        scroll
        role="tab"
        aria-selected={onListings}
        onClick={(e) => {
          if (!guardBeforeNavigate(PRODUCTS_HREF)) e.preventDefault();
        }}
        className={dibaySecondaryTabClass(onListings)}
      >
        <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{listingsPill}</span>
      </Link>
      <Link
        href={MESSAGES_HREF}
        prefetch={false}
        scroll
        role="tab"
        aria-selected={onMessages}
        onClick={(e) => {
          if (!guardBeforeNavigate(MESSAGES_HREF)) e.preventDefault();
        }}
        className={dibaySecondaryTabClass(onMessages)}
      >
        <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{messagesPill}</span>
      </Link>
      <Link
        href={ALERTS_HREF}
        prefetch={false}
        scroll
        role="tab"
        aria-selected={onAlerts}
        onClick={(e) => {
          if (!guardBeforeNavigate(ALERTS_HREF)) e.preventDefault();
        }}
        className={dibaySecondaryTabClass(onAlerts)}
      >
        <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{alertsPill}</span>
      </Link>
    </DibaySecondaryTabRow>
  );
}

export function MarketplaceSellHubPage() {
  return (
    <MypageSubpageShell
      titleKey="marketplace_sell_hub_title"
      subtitleKey="marketplace_sell_hub_subtitle"
      backHref="/market"
      section="trade"
      bodyClassName={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      stickyBelow={<MarketplaceSellHubPills />}
    >
      <MarketplaceSellHubContent />
    </MypageSubpageShell>
  );
}
