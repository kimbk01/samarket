"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { SellerHubNav } from "@/components/mypage/seller/SellerHubNav";
import { Sam } from "@/lib/ui/sam-component-classes";

const PROMOTIONS_HREF = "/mypage/points/promotions";

function HubManagementRow({
  title,
  description,
  href,
  onNavigate,
}: {
  title: string;
  description: string;
  href: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3.5 text-left active:bg-sam-surface-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="sam-text-body font-semibold text-sam-fg">{title}</p>
        <p className="mt-0.5 sam-text-helper text-sam-muted">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-sam-muted" aria-hidden />
    </button>
  );
}

export function MarketplaceSellHubPage() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const writeCtx = useWriteCategory();

  const go = (href: string) => {
    if (!guardBeforeNavigate(href)) return;
    router.push(href);
  };

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    openTradeWriteSheet("");
  };

  const hubSubtitle = safeT("marketplace_sell_hub_subtitle", {
    fallbackKo: "DIBAY MARKET",
    fallbackEn: "DIBAY MARKET",
  });
  const hubTitle = safeT("marketplace_sell_hub_title", {
    fallbackKo: "판매자 센터",
    fallbackEn: "Seller center",
  });

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-4 md:max-w-2xl lg:max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sam-text-helper font-medium uppercase tracking-wide text-sam-muted">{hubSubtitle}</p>
          <h1 className="mt-0.5 sam-text-title-3 text-sam-fg">{hubTitle}</h1>
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

      <div className="mt-4">
        <SellerHubNav active="hub" />
      </div>

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

      <section className="mt-8" aria-labelledby="seller-hub-manage-heading">
        <h2 id="seller-hub-manage-heading" className="sam-text-body-secondary font-semibold text-sam-fg">
          {safeT("marketplace_sell_hub_section_manage", {
            fallbackKo: "판매 관리",
            fallbackEn: "Selling",
          })}
        </h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <HubManagementRow
            title={safeT("marketplace_sell_hub_listings_row_title", {
              fallbackKo: "등록한 매물",
              fallbackEn: "Your listings",
            })}
            description={safeT("marketplace_sell_hub_listings_row_desc", {
              fallbackKo: "수정 · 숨김 · 홍보",
              fallbackEn: "Edit · hide · promote",
            })}
            href="/mypage/products"
            onNavigate={go}
          />
          <HubManagementRow
            title={safeT("marketplace_sell_hub_trades_row_title", {
              fallbackKo: "거래 관리",
              fallbackEn: "Trade management",
            })}
            description={safeT("marketplace_sell_hub_trades_row_desc", {
              fallbackKo: "구매자별 거래 · 채팅",
              fallbackEn: "Per-buyer deals · chat",
            })}
            href={MYPAGE_HOME_TRADE_SALES_HREF}
            onNavigate={go}
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="seller-hub-promo-heading">
        <h2 id="seller-hub-promo-heading" className="sam-text-body-secondary font-semibold text-sam-fg">
          {safeT("marketplace_sell_hub_section_promotion", {
            fallbackKo: "홍보",
            fallbackEn: "Promotion",
          })}
        </h2>
        <div className="mt-3">
          <HubManagementRow
            title={safeT("marketplace_sell_hub_promotion_row_title", {
              fallbackKo: "홍보 관리",
              fallbackEn: "Promotion",
            })}
            description={safeT("marketplace_sell_hub_promotion_row_desc", {
              fallbackKo: "더 알리기 · 홍보 현황",
              fallbackEn: "Boost visibility · status",
            })}
            href={PROMOTIONS_HREF}
            onNavigate={go}
          />
        </div>
      </section>

      <div className="mt-10 border-t border-sam-border pt-4 text-center">
        <Link
          href="/mypage"
          onClick={(e) => {
            if (!guardBeforeNavigate("/mypage")) {
              e.preventDefault();
            }
          }}
          className="sam-text-body-secondary font-medium text-sam-muted underline-offset-2 hover:text-sam-fg hover:underline"
        >
          {t("nav_bottom_my")}
        </Link>
      </div>
    </main>
  );
}
