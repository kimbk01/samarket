"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

/** `/mypage/trade` 인덱스와 `/mypage/trade/purchases` 모두 구매 탭 활성 */
function isPurchasesHubPath(norm: string): boolean {
  const p = norm.replace(/\/+$/, "") || "/";
  return p === "/mypage/trade" || p === "/mypage/trade/purchases";
}

function linkActive(
  norm: string,
  item: { href: string; matchPrefix?: string; pathMatch?: "prefix" | "exact" }
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
 * 거래 허브 1단 탭 — `/philife` 주제 탭과 동일: `bg-sam-surface` 스트립 + `APP_MAIN_HEADER_INNER` + `sam-tabs--scroll`.
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
          href: "/community-messenger?section=chats&kind=trade",
          matchPrefix: "/community-messenger",
        },
      ] as const,
    [t]
  );

  return (
    <nav
      aria-label={t("nav_trade_hub_menu")}
      className="min-w-0 w-full max-w-full overflow-x-hidden border-b border-sam-border bg-sam-surface"
    >
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <div className={`${Sam.tabs.barScroll} flex w-full min-w-0 max-w-full`} role="tablist">
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
                className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
              >
                <span className="block min-w-0 max-w-[min(10rem,40vw)] truncate px-0.5">{row.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
