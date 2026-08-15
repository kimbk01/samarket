"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** `/mypage/trade` 인덱스와 `/mypage/trade/purchases` 모두 구매 탭 활성 */
function isPurchasesHubPath(norm: string): boolean {
  const p = norm.replace(/\/+$/, "") || "/";
  return p === "/mypage/trade" || p === "/mypage/trade/purchases";
}

function linkActive(
  norm: string,
  item: { href: string; matchPrefix?: string; pathMatch?: "prefix" | "exact" },
): boolean {
  const hrefPath = (item.href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  const prefix = (item.matchPrefix ?? hrefPath).replace(/\/+$/, "") || "/";
  const p = norm.replace(/\/+$/, "") || "/";
  const mode = item.pathMatch ?? "prefix";
  return mode === "exact"
    ? p === prefix
    : p === prefix || (prefix !== "/" && p.startsWith(`${prefix}/`));
}

/**
 * 거래 허브 PRIMARY SECTION NAV — shared dibay secondary (oval parallel removed).
 */
export function TradeHubTopTabs() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const norm = pathname.split("?")[0] ?? "";

  const rows = useMemo(
    () =>
      [
        { key: "purchases", label: t("nav_trade_hub_purchases"), href: "/mypage/trade" },
        {
          key: "sales",
          label: t("nav_trade_hub_sales"),
          href: "/mypage/trade/sales",
          pathMatch: "exact" as const,
        },
        {
          key: "favorites",
          label: t("nav_trade_hub_favorites"),
          href: MYPAGE_TRADE_FAVORITES_HREF,
          pathMatch: "exact" as const,
        },
        {
          key: "reviews",
          label: t("nav_trade_hub_reviews"),
          href: "/mypage/trade/reviews",
          pathMatch: "exact" as const,
        },
        {
          key: "chat",
          label: t("nav_trade_hub_chat"),
          href: TRADE_CHAT_SURFACE.messengerListHref,
          matchPrefix: "/community-messenger",
        },
      ] as const,
    [t],
  );

  return (
    <nav
      aria-label={t("nav_trade_hub_menu")}
      className={`${DIBAY_CHROME_SECONDARY_HOST_CLASS} w-full max-w-full border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))]`}
      data-dibay-primary-nav="trade-hub"
      data-dibay-nav="secondary"
    >
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`}>
        <div className={`${DIBAY_SECONDARY_TABS_CLASS} border-b-0 bg-transparent px-0`} role="tablist">
          {rows.map((row) => {
            const active =
              row.key === "purchases" ? isPurchasesHubPath(norm) : linkActive(norm, row);
            return (
              <Link
                key={row.key}
                href={row.href}
                prefetch={row.key !== "chat"}
                role="tab"
                aria-selected={active}
                className={dibaySecondaryTabClass(active)}
              >
                <span className="max-w-[min(10rem,40vw)] truncate">{row.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
