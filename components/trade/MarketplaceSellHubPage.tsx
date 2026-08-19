"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";

const ITEM_CLASS =
  "flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-left sam-text-body font-medium text-sam-fg active:scale-[0.99] active:opacity-90";

export function MarketplaceSellHubPage() {
  const { t } = useI18n();
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

  return (
    <main className="mx-auto w-full max-w-[680px] px-4 pb-24 pt-4">
      <h1 className="sam-text-title-3 text-sam-fg">{t("marketplace_sell_hub_title")}</h1>
      <p className="mt-1 sam-text-body text-sam-muted">{t("marketplace_home_title")}</p>
      <div className="mt-4 space-y-2">
        <button type="button" className={ITEM_CLASS} onClick={openWrite}>
          <span>{t("marketplace_sell_hub_create")}</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => go("/mypage/products")}>
          <span>{t("marketplace_sell_hub_listings")}</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => go(MYPAGE_HOME_TRADE_SALES_HREF)}>
          <span>{t("trade_122")}</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => go("/mypage")}>
          <span>{t("nav_bottom_my")}</span>
        </button>
      </div>
    </main>
  );
}
