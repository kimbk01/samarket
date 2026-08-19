"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
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

const PRODUCTS_HREF = "/mypage/products";
const MESSAGES_HREF = TRADE_CHAT_SURFACE.messengerListHref;

export function MarketplaceSellHubPage() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const writeCtx = useWriteCategory();
  const [activeListingCount, setActiveListingCount] = useState<number | null>(null);
  const [openChatCount, setOpenChatCount] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    const uid = getCurrentUser()?.id?.trim();
    if (!uid) {
      setActiveListingCount(0);
      setOpenChatCount(0);
      return;
    }
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

  const hubTitle = safeT("marketplace_sell_hub_title", {
    fallbackKo: "판매",
    fallbackEn: "Sell",
  });
  const listingsPill = safeT("marketplace_seller_hub_pill_listings", {
    fallbackKo: "내 매물",
    fallbackEn: "My listings",
  });
  const messagesPill = safeT("marketplace_seller_hub_pill_messages", {
    fallbackKo: "받은 메시지",
    fallbackEn: "Inbox",
  });

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-4 md:max-w-2xl lg:max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-title-3 text-sam-fg">{hubTitle}</h1>
        </div>
        <button
          type="button"
          aria-label={t("common_cancel")}
          className="rounded-ui-rect p-2 text-sam-fg-muted active:scale-[0.98] active:opacity-90"
          onClick={() => {
            if (!guardBeforeNavigate()) return;
            router.back();
          }}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav
        aria-label={safeT("marketplace_seller_hub_pill_nav", {
          fallbackKo: "판매 메뉴",
          fallbackEn: "Selling menu",
        })}
        className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href={PRODUCTS_HREF}
          onClick={(e) => {
            if (!guardBeforeNavigate(PRODUCTS_HREF)) e.preventDefault();
          }}
          className={`shrink-0 rounded-full px-3 py-1.5 sam-text-body-secondary font-medium ${
            pathname.startsWith(PRODUCTS_HREF)
              ? "bg-signature text-white"
              : "border border-sam-border bg-sam-surface text-sam-fg-muted"
          }`}
        >
          {listingsPill}
        </Link>
        <Link
          href={MESSAGES_HREF}
          onClick={(e) => {
            if (!guardBeforeNavigate(MESSAGES_HREF)) e.preventDefault();
          }}
          className="shrink-0 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary font-medium text-sam-fg-muted"
        >
          {messagesPill}
        </Link>
      </nav>

      <button
        type="button"
        className={`${Sam.btn.primaryCombo} ${Sam.btn.block} mt-5 flex items-center justify-center gap-2 py-3.5`}
        onClick={openWrite}
      >
        <Plus className="h-5 w-5 shrink-0" aria-hidden />
        <span>
          {safeT("marketplace_sell_hub_create", {
            fallbackKo: "상품 등록",
            fallbackEn: "Post item",
          })}
        </span>
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
    </main>
  );
}
