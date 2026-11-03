"use client";

import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import { fetchTradeHistorySalesBySession } from "@/lib/mypage/trade-history-client";
import {
  countActiveListingProducts,
  countOpenSellerChatRows,
} from "@/lib/mypage/seller-listings-with-trades";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
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

type TradePerformance = { views: number; favorites: number; reports: number };

function MarketplaceSellHubContent() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const writeCtx = useWriteCategory();
  const [activeListingCount, setActiveListingCount] = useState<number | null>(null);
  const [openChatCount, setOpenChatCount] = useState<number | null>(null);
  const [performance, setPerformance] = useState<TradePerformance | null>(null);

  const loadOverview = useCallback(async () => {
    const uid = getCurrentUser()?.id?.trim();
    if (!uid) {
      setActiveListingCount(0);
      setOpenChatCount(0);
      setPerformance({ views: 0, favorites: 0, reports: 0 });
      return;
    }
    /** 거래 E 성과(조회수·찜·신고) — 실패해도 개요는 그대로 */
    void fetch("/api/my/trade-performance", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Partial<TradePerformance> & { ok?: boolean };
        if (!res.ok || !data.ok) {
          setPerformance(null);
          return;
        }
        setPerformance({
          views: Number(data.views) || 0,
          favorites: Number(data.favorites) || 0,
          reports: Number(data.reports) || 0,
        });
      })
      .catch(() => setPerformance(null));
    try {
      const [postsRes, salesRows] = await Promise.all([
        runSingleFlight(`me:my-posts:${uid}`, () => fetch("/api/my/posts")),
        fetchTradeHistorySalesBySession().catch(() => [] as SalesHistoryRow[]),
      ]);
      let posts: Product[] = [];
      if (postsRes.ok) {
        const data = (await postsRes.json()) as { posts?: Product[] };
        posts = data.posts ?? [];
      }
      setActiveListingCount(countActiveListingProducts(posts));
      setOpenChatCount(countOpenSellerChatRows(salesRows));
    } catch {
      setActiveListingCount(null);
      setOpenChatCount(null);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const go = (href: string) => {
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
  };

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  };

  const listingsPill = safeT("marketplace_seller_hub_pill_listings", {
    fallbackKo: "내 매물",
    fallbackEn: "My listings",
  });
  const messagesPill = safeT("marketplace_seller_hub_pill_messages", {
    fallbackKo: "받은 메시지",
    fallbackEn: "Inbox",
  });

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
          {safeT("marketplace_seller_hub_overview", {
            fallbackKo: "개요",
            fallbackEn: "Overview",
          })}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => go(`${PRODUCTS_HREF}?filter=active`)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left active:bg-sam-surface-muted"
          >
            <p className="sam-text-helper text-sam-muted">
              {safeT("marketplace_seller_hub_overview_active", {
                fallbackKo: "판매중",
                fallbackEn: "For sale",
              })}
            </p>
            <p className="mt-1 sam-text-body font-semibold text-sam-fg">
              {activeListingCount === null ? "—" : `${activeListingCount}`}
            </p>
          </button>
          <button
            type="button"
            onClick={() => go(MESSAGES_HREF)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left active:bg-sam-surface-muted"
          >
            <p className="sam-text-helper text-sam-muted">
              {safeT("marketplace_seller_hub_overview_chats", {
                fallbackKo: "답장할 채팅",
                fallbackEn: "Chats to reply",
              })}
            </p>
            <p className="mt-1 sam-text-body font-semibold text-sam-fg">
              {openChatCount === null ? "—" : `${openChatCount}`}
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
                {performance === null ? "—" : `${performance[key]}`}
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
          {safeT("marketplace_seller_cta_manage_listings", {
            fallbackKo: "내 매물 관리",
            fallbackEn: "Manage my listings",
          })}
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
  const listingsPill = safeT("marketplace_seller_hub_pill_listings", {
    fallbackKo: "내 매물",
    fallbackEn: "My listings",
  });
  const messagesPill = safeT("marketplace_seller_hub_pill_messages", {
    fallbackKo: "받은 메시지",
    fallbackEn: "Inbox",
  });
  const alertsPill = safeT("marketplace_seller_hub_pill_alerts", {
    fallbackKo: "알림",
    fallbackEn: "Notifications",
  });
  const onListings = pathname.startsWith(PRODUCTS_HREF);
  const onMessages = pathname.startsWith("/community-messenger/trade-chats");
  const onAlerts = pathname.startsWith("/notifications");

  return (
    <DibaySecondaryTabRow
      bordered
      navRole="secondary"
      trackAriaLabel={safeT("marketplace_seller_hub_pill_nav", {
        fallbackKo: "판매 메뉴",
        fallbackEn: "Selling menu",
      })}
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
